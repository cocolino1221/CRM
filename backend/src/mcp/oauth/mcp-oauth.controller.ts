import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { McpOauthClient } from '../../database/entities/mcp-oauth-client.entity';
import { McpOauthService } from './mcp-oauth.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { renderConsentPage } from './consent.view';

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  response_type?: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  scope?: string;
}

interface ConsentParams extends AuthorizeParams {
  decision?: string;
}

@Controller('oauth/mcp')
export class McpOauthController {
  constructor(private readonly mcpOauthService: McpOauthService) {}

  /**
   * RFC 7591 Dynamic Client Registration.
   * POST /api/v1/oauth/mcp/register
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterClientDto) {
    const client = await this.mcpOauthService.registerClient(dto);
    return {
      client_id: client.clientId,
      redirect_uris: client.redirectUris,
      client_name: client.clientName,
    };
  }

  /**
   * GET /api/v1/oauth/mcp/authorize
   * Requires a logged-in CRM user (JwtAuthGuard). Renders the consent
   * screen listing the requesting client, the user's workspace, and the
   * requested scopes.
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(
    @Query() query: AuthorizeParams,
    @CurrentUser() user: User,
  ): Promise<string> {
    const { client, scopes } = await this.validateAuthorizeParams(query);

    return renderConsentPage({
      clientId: client.clientId,
      clientName: client.clientName,
      workspaceName: user.workspace?.name ?? '',
      scopes,
      redirectUri: query.redirect_uri,
      responseType: query.response_type ?? 'code',
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
      state: query.state,
    });
  }

  /**
   * POST /api/v1/oauth/mcp/authorize/consent
   * Re-validates the same params, upserts the McpOauthGrant, issues a
   * signed PKCE auth code, and redirects back to the client's redirect_uri.
   */
  @Post('authorize/consent')
  @UseGuards(JwtAuthGuard)
  async consent(
    @Body() body: ConsentParams,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const { client, scopes } = await this.validateAuthorizeParams(body);

    if (body.decision === 'deny') {
      const denialUrl = new URL(body.redirect_uri);
      denialUrl.searchParams.set('error', 'access_denied');
      if (body.state) denialUrl.searchParams.set('state', body.state);
      res.redirect(denialUrl.toString());
      return;
    }

    await this.mcpOauthService.upsertGrant({
      workspaceId: user.workspaceId,
      userId: user.id,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes,
    });

    const code = this.mcpOauthService.issueAuthCode({
      clientId: client.clientId,
      workspaceId: user.workspaceId,
      userId: user.id,
      role: user.role,
      scopes,
      codeChallenge: body.code_challenge,
      redirectUri: body.redirect_uri,
    });

    const redirectUrl = new URL(body.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (body.state) redirectUrl.searchParams.set('state', body.state);

    res.redirect(redirectUrl.toString());
  }

  /**
   * Shared validation for both the authorize GET and consent POST: the
   * client must exist, redirect_uri must be one of its registered URIs
   * (never redirect to an unregistered URI), and PKCE must be S256.
   */
  private async validateAuthorizeParams(
    query: AuthorizeParams,
  ): Promise<{ client: McpOauthClient; scopes: string[] }> {
    if (!query.client_id) {
      throw new BadRequestException('client_id is required');
    }

    const client = await this.mcpOauthService.findClientByClientId(query.client_id);
    if (!client) {
      throw new BadRequestException('Unknown client_id');
    }

    if (!query.redirect_uri || !client.redirectUris.includes(query.redirect_uri)) {
      throw new BadRequestException('redirect_uri is not registered for this client');
    }

    if (!query.code_challenge) {
      throw new BadRequestException('code_challenge is required');
    }

    if (query.code_challenge_method !== 'S256') {
      throw new BadRequestException('code_challenge_method must be S256');
    }

    const scopes = (query.scope ?? '').split(' ').filter(Boolean);

    return { client, scopes };
  }
}
