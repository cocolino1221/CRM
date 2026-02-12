import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(private readonly configService: ConfigService) {
    this.uploadPath = this.configService.get('UPLOAD_PATH', './uploads');
    this.maxFileSize = this.configService.get('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ];
  }

  async onModuleInit() {
    // Ensure upload directory exists
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
    const folderPath = subfolder ? join(this.uploadPath, subfolder) : this.uploadPath;

    // Ensure subfolder exists
    await fs.mkdir(folderPath, { recursive: true });

    const filePath = join(folderPath, filename);
    const relativePath = subfolder ? join(subfolder, filename) : filename;

    // Write file to disk
    await fs.writeFile(filePath, file.buffer);

    this.logger.log(`File saved: ${relativePath}`);

    const baseUrl = this.configService.get('APP_URL', 'http://localhost:4000');

    return {
      originalName: file.originalname,
      filename,
      path: relativePath,
      url: `${baseUrl}/uploads/${relativePath}`,
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
      const fullPath = join(this.uploadPath, filePath);
      await fs.unlink(fullPath);
      this.logger.log(`File deleted: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${filePath}: ${error.message}`);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  async getFileUrl(filePath: string): Promise<string> {
    const baseUrl = this.configService.get('APP_URL', 'http://localhost:4000');
    return `${baseUrl}/uploads/${filePath}`;
  }

  getFilePath(filename: string, subfolder?: string): string {
    return subfolder ? join(subfolder, filename) : filename;
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = join(this.uploadPath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
