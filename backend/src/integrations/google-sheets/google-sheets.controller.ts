import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleSheetsService, SheetsSyncConfig } from './google-sheets.service';
import { GoogleDriveBackupService, DriveBackupConfig } from './google-drive-backup.service';

@ApiTags('Google Sheets Sync')
@Controller('integrations/google-sheets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GoogleSheetsController {
  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly driveBackupService: GoogleDriveBackupService,
  ) {}

  @Get('spreadsheets')
  @ApiOperation({ summary: 'List Google Sheets available to the connected account' })
  async listSpreadsheets(@Req() req: any) {
    return this.sheetsService.listSpreadsheets(req.user.workspaceId);
  }

  @Get('spreadsheets/:spreadsheetId')
  @ApiOperation({ summary: 'Get tabs + header columns of a spreadsheet (for mapping UI)' })
  async spreadsheetInfo(@Req() req: any, @Param('spreadsheetId') spreadsheetId: string) {
    return this.sheetsService.getSpreadsheetInfo(req.user.workspaceId, spreadsheetId);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get current Sheets sync configuration' })
  async getConfig(@Req() req: any) {
    return this.sheetsService.getSyncConfig(req.user.workspaceId);
  }

  @Put('config')
  @ApiOperation({ summary: 'Save Sheets sync configuration (mapping, pipeline, direction)' })
  async saveConfig(@Req() req: any, @Body() dto: Partial<SheetsSyncConfig>) {
    return this.sheetsService.saveSyncConfig(req.user.workspaceId, dto);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Run the 2-way sync now' })
  async syncNow(@Req() req: any) {
    return this.sheetsService.syncNow(req.user.workspaceId);
  }

  // ── Drive document backup ──

  @Get('drive/folders')
  @ApiOperation({ summary: 'List Drive folders for the backup target picker' })
  async listDriveFolders(@Req() req: any) {
    return this.driveBackupService.listFolders(req.user.workspaceId);
  }

  @Get('drive/config')
  @ApiOperation({ summary: 'Get Drive document-backup configuration' })
  async getDriveConfig(@Req() req: any) {
    return this.driveBackupService.getBackupConfig(req.user.workspaceId);
  }

  @Put('drive/config')
  @ApiOperation({ summary: 'Save Drive document-backup configuration' })
  async saveDriveConfig(
    @Req() req: any,
    @Body() dto: Partial<DriveBackupConfig> & { createFolderName?: string },
  ) {
    return this.driveBackupService.saveBackupConfig(req.user.workspaceId, dto);
  }

  @Post('drive/backup')
  @ApiOperation({ summary: 'Back up CRM documents to Drive now' })
  async backupNow(@Req() req: any) {
    return this.driveBackupService.backupNow(req.user.workspaceId);
  }
}
