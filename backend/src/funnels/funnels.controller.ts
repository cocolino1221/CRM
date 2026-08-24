import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('funnels')
@UseGuards(JwtAuthGuard)
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateFunnelDto) {
    return this.funnelsService.create(req.user.workspaceId, dto);
  }

  @Get()
  findAll(@Req() req) {
    return this.funnelsService.findAll(req.user.workspaceId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.funnelsService.findOne(req.user.workspaceId, id);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateFunnelDto) {
    return this.funnelsService.update(req.user.workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.funnelsService.remove(req.user.workspaceId, id);
  }

  @Get(':id/enrollments')
  listEnrollments(@Req() req, @Param('id') id: string) {
    return this.funnelsService.listEnrollments(req.user.workspaceId, id);
  }

  @Patch('enrollments/:enrollmentId/attended')
  setAttended(@Req() req, @Param('enrollmentId') enrollmentId: string, @Body('attended') attended: boolean) {
    return this.funnelsService.setAttended(req.user.workspaceId, enrollmentId, !!attended);
  }
}
