import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  UseGuards,
  Req,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService, UploadedFileInfo } from './upload.service';

@ApiTags('Upload')
@Controller('upload')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('single')
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        subfolder: {
          type: 'string',
          description: 'Optional subfolder to organize uploads',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or file type not allowed' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body('subfolder') subfolder?: string,
  ): Promise<UploadedFileInfo> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.uploadService.saveFile(file, subfolder);
  }

  @Post('multiple')
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        subfolder: {
          type: 'string',
          description: 'Optional subfolder to organize uploads',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Files uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid files or file types not allowed' })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('subfolder') subfolder?: string,
  ): Promise<UploadedFileInfo[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    return this.uploadService.saveMultipleFiles(files, subfolder);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Avatar uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<UploadedFileInfo> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate it's an image
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    return this.uploadService.saveFile(file, `avatars/${req.user.workspaceId}`);
  }

  @Post('document')
  @ApiOperation({ summary: 'Upload document file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        contactId: {
          type: 'string',
          description: 'Optional contact ID to associate with',
        },
        dealId: {
          type: 'string',
          description: 'Optional deal ID to associate with',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<UploadedFileInfo> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.uploadService.saveFile(file, `documents/${req.user.workspaceId}`);
  }

  @Delete('*path')
  @ApiOperation({ summary: 'Delete uploaded file' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Param('path') path: string): Promise<{ message: string }> {
    await this.uploadService.deleteFile(path);
    return { message: 'File deleted successfully' };
  }
}
