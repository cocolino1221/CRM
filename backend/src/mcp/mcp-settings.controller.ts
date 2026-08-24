import { Controller, Get, Delete, Param, NotFoundException, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';
import { McpOauthGrant } from '../database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../database/entities/mcp-refresh-token.entity';

/**
 * Settings-facing grant management for the MCP integration: lets a
 * workspace user see which AI clients (Claude, ChatGPT, ...) have been
 * granted access and revoke that access.
 *
 * Revocation (Ruling 9): there is no access-token blacklist for MCP —
 * revoking flips `grant.revoked` and all of the grant's `McpRefreshToken`
 * rows to `revoked: true`, so the client can no longer mint a new 15m
 * access token via refresh. Any access token already issued keeps working
 * until it naturally expires (<=15m later).
 */
@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpSettingsController {
  constructor(
    @InjectRepository(McpOauthGrant)
    private readonly grantRepo: Repository<McpOauthGrant>,
    @InjectRepository(McpRefreshToken)
    private readonly refreshTokenRepo: Repository<McpRefreshToken>,
  ) {}

  /**
   * GET /api/v1/mcp/grants
   * Lists this workspace's active (non-revoked) grants.
   */
  @Get('grants')
  async listGrants(@CurrentUser() user: User) {
    const grants = await this.grantRepo.find({
      where: { workspaceId: user.workspaceId, revoked: false },
      order: { createdAt: 'DESC' },
    });

    return grants.map((grant) => ({
      id: grant.id,
      clientName: grant.clientName,
      scopes: grant.scopes,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    }));
  }

  /**
   * DELETE /api/v1/mcp/grants/:id
   * Revokes a grant belonging to the caller's workspace. 404s (rather than
   * 403) if the grant belongs to another workspace, so this endpoint never
   * confirms/denies the existence of another workspace's grant IDs.
   */
  @Delete('grants/:id')
  @HttpCode(HttpStatus.OK)
  async revokeGrant(@Param('id') id: string, @CurrentUser() user: User) {
    const grant = await this.grantRepo.findOne({
      where: { id, workspaceId: user.workspaceId },
    });

    if (!grant) {
      throw new NotFoundException('Grant not found');
    }

    grant.revoked = true;
    await this.grantRepo.save(grant);

    await this.refreshTokenRepo.update({ grantId: grant.id }, { revoked: true });

    return { success: true };
  }
}
