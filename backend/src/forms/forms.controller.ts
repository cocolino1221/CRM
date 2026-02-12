import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  Ip,
  Headers,
} from '@nestjs/common';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FormStatus } from '../database/entities/form.entity';
import { SubmissionStatus } from '../database/entities/form-submission.entity';

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req, @Body() createFormDto: CreateFormDto) {
    return this.formsService.create(req.user.id, req.user.workspaceId, createFormDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req, @Query('status') status?: FormStatus) {
    return this.formsService.findAll(req.user.workspaceId, status);
  }

  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.formsService.findBySlug(slug);
  }

  @Post('public/:slug/submit')
  submitForm(
    @Param('slug') slug: string,
    @Body() submitFormDto: SubmitFormDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
  ) {
    return this.formsService.submitForm(slug, submitFormDto, {
      ipAddress: ip,
      userAgent,
      referrer,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req, @Param('id') id: string) {
    return this.formsService.findOne(id, req.user.workspaceId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Req() req, @Param('id') id: string, @Body() updateFormDto: UpdateFormDto) {
    return this.formsService.update(id, req.user.workspaceId, updateFormDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req, @Param('id') id: string) {
    return this.formsService.remove(id, req.user.workspaceId);
  }

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  getSubmissions(
    @Req() req,
    @Param('id') id: string,
    @Query('status') status?: SubmissionStatus,
  ) {
    return this.formsService.getSubmissions(id, req.user.workspaceId, status);
  }

  @Patch('submissions/:id/status')
  @UseGuards(JwtAuthGuard)
  updateSubmissionStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { status: SubmissionStatus; notes?: string },
  ) {
    return this.formsService.updateSubmissionStatus(
      id,
      req.user.workspaceId,
      body.status,
      body.notes,
    );
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  getAnalytics(@Req() req, @Param('id') id: string) {
    return this.formsService.getFormAnalytics(id, req.user.workspaceId);
  }
}
