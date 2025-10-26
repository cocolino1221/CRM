import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for current user' })
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.findAll(workspaceId, userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    const count = await this.notificationsService.getUnreadCount(workspaceId, userId);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(workspaceId, userId, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.notificationsService.markAllAsRead(workspaceId, userId);
    return { message: 'All notifications marked as read' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  async delete(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationsService.delete(workspaceId, userId, id);
    return { message: 'Notification deleted' };
  }
}
