import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadedFileInfo {
  originalName: string;
  filename: string;
  path: string;
  url: string;
  size: number;
  mimetype: string;
  uploadedAt: Date;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadPath: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  private readonly s3Client?: S3Client;
  private readonly r2Bucket?: string;
  private readonly r2PublicUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadPath = this.configService.get('UPLOAD_PATH', './uploads');
    this.maxFileSize = this.configService.get('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/opus',
      'audio/wav',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ];

    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('R2_BUCKET');
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');
    // EU/FedRAMP buckets need a jurisdiction-specific endpoint; allow an explicit override.
    const endpoint =
      this.configService.get<string>('R2_ENDPOINT') ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    if (accountId && accessKeyId && secretAccessKey && bucket && publicUrl) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.r2Bucket = bucket;
      this.r2PublicUrl = publicUrl.replace(/\/+$/, '');
      this.logger.log(`Upload storage: Cloudflare R2 (bucket "${bucket}")`);
    } else {
      this.logger.log('Upload storage: local disk (R2 not configured)');
    }
  }

  private get usesR2(): boolean {
    return Boolean(this.s3Client && this.r2Bucket && this.r2PublicUrl);
  }

  async onModuleInit() {
    if (this.usesR2) return;
    try {
      await fs.mkdir(this.uploadPath, { recursive: true });
      this.logger.log(`Upload directory ensured at: ${this.uploadPath}`);
    } catch (error) {
      this.logger.error(`Failed to create upload directory: ${error.message}`);
    }
  }

  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  generateFilename(originalName: string): string {
    const ext = originalName.split('.').pop();
    return `${uuidv4()}.${ext}`;
  }

  async saveFile(file: Express.Multer.File, subfolder?: string): Promise<UploadedFileInfo> {
    this.validateFile(file);

    const filename = this.generateFilename(file.originalname);
    const relativePath = subfolder ? `${subfolder}/${filename}` : filename;

    let url: string;
    if (this.usesR2) {
      await this.s3Client!.send(
        new PutObjectCommand({
          Bucket: this.r2Bucket!,
          Key: relativePath,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      url = `${this.r2PublicUrl}/${relativePath}`;
    } else {
      const folderPath = subfolder ? join(this.uploadPath, subfolder) : this.uploadPath;
      await fs.mkdir(folderPath, { recursive: true });
      await fs.writeFile(join(folderPath, filename), file.buffer);
      url = `${this.getPublicBaseUrl()}/uploads/${relativePath}`;
    }

    this.logger.log(`File saved: ${relativePath}`);

    return {
      originalName: file.originalname,
      filename,
      path: relativePath,
      url,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date(),
    };
  }

  async saveMultipleFiles(
    files: Express.Multer.File[],
    subfolder?: string,
  ): Promise<UploadedFileInfo[]> {
    return Promise.all(files.map((file) => this.saveFile(file, subfolder)));
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (this.usesR2) {
        await this.s3Client!.send(
          new DeleteObjectCommand({ Bucket: this.r2Bucket!, Key: filePath }),
        );
      } else {
        await fs.unlink(join(this.uploadPath, filePath));
      }
      this.logger.log(`File deleted: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${filePath}: ${error.message}`);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  async getFileUrl(filePath: string): Promise<string> {
    if (this.usesR2) {
      return `${this.r2PublicUrl}/${filePath}`;
    }
    return `${this.getPublicBaseUrl()}/uploads/${filePath}`;
  }

  // Static uploads are mounted at /uploads, OUTSIDE the api/v1 global prefix,
  // so the public URL must not carry the prefix that APP_URL may include.
  private getPublicBaseUrl(): string {
    const appUrl = this.configService.get('APP_URL', 'http://localhost:4000');
    return appUrl.replace(/\/api\/v1\/?$/, '');
  }

  getFilePath(filename: string, subfolder?: string): string {
    return subfolder ? join(subfolder, filename) : filename;
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      if (this.usesR2) {
        await this.s3Client!.send(
          new HeadObjectCommand({ Bucket: this.r2Bucket!, Key: filePath }),
        );
        return true;
      }
      await fs.access(join(this.uploadPath, filePath));
      return true;
    } catch {
      return false;
    }
  }
}
