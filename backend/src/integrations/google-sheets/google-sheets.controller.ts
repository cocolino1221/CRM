import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleSheetsService, SheetsSyncConfig } from './google-sheets.service';

@ApiTags('Google Sheets Sync')
@Controller('integrations/google-sheets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GoogleSheetsController {
  constructor(private readonly sheetsService: GoogleSheetsService) {}

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
}
