import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AudioLibraryService, AudioSendChannel } from './audio-library.service';

const audioUploadInterceptor = AnyFilesInterceptor({
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'audio.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safe}`);
    },
  }),
  limits: { fileSize: 32 * 1024 * 1024 },
});

@ApiTags('Audio Library')
@Controller('integrations/audio-library')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AudioLibraryController {
  constructor(private readonly audioLibraryService: AudioLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'List the shared audio-note library for the workspace' })
  async list(@Req() req: any) {
    return this.audioLibraryService.list(req.user.workspaceId);
  }

  @Post()
  @UseInterceptors(audioUploadInterceptor)
  @ApiOperation({ summary: 'Upload an audio clip and save it to the shared library (max 10)' })
  async create(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { name?: string },
  ) {
    const file = files?.[0];
    if (!file) throw new BadRequestException('Audio file is required');
    return this.audioLibraryService.create(req.user.workspaceId, body.name || '', {
      path: file.path,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an audio clip from the shared library' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.audioLibraryService.delete(req.user.workspaceId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send a saved audio clip into an open conversation on any channel' })
  async send(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { channel: AudioSendChannel; to: string; integrationId?: string; simulate?: boolean },
  ) {
    return this.audioLibraryService.send(req.user.workspaceId, req.user.id, id, body);
  }
}
