import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { McpOauthClient } from '../../database/entities/mcp-oauth-client.entity';
import { McpOauthService, McpOAuthTokenException } from './mcp-oauth.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { TokenRequestDto } from './dto/token-request.dto';
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
  csrf?: string;
}

const CONSENT_NONCE_COOKIE = 'mcp_consent_nonce';
const CONSENT_NONCE_MAX_AGE_MS = 5 * 60 * 1000;

@Controller('oauth/mcp')
export class McpOauthController {
  constructor(
    private readonly mcpOauthService: McpOauthService,
    private readonly configService: ConfigService,
  ) {}

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
   * POST /api/v1/oauth/mcp/token
   * Public (no auth guard — this IS the endpoint that mints auth). Handles
   * both `grant_type=authorization_code` (PKCE-verified code exchange) and
   * `grant_type=refresh_token` (rotation). Errors follow RFC 6749 §5.2:
   * HTTP 400 with `{ error, error_description? }`.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(@Body() body: TokenRequestDto) {
    if (!body?.grant_type) {
      throw new McpOAuthTokenException('invalid_request', 'grant_type is required');
    }

    if (body.grant_type === 'authorization_code') {
      return this.mcpOauthService.exchangeCode({
        code: body.code,
        codeVerifier: body.code_verifier,
        clientId: body.client_id,
        redirectUri: body.redirect_uri,
      });
    }

    if (body.grant_type === 'refresh_token') {
      return this.mcpOauthService.refresh({ refreshToken: body.refresh_token });
    }

    throw new McpOAuthTokenException(
      'unsupported_grant_type',
      `Unsupported grant_type: ${body.grant_type}`,
    );
  }

  /**
   * GET /api/v1/oauth/mcp/authorize
   * Requires a logged-in CRM user (JwtAuthGuard). Renders the consent
   * screen listing the requesting client, the user's workspace, and the
   * requested scopes. Also mints a short-lived CSRF nonce, set as a
   * strict, httpOnly cookie AND embedded as a hidden form field, so the
   * consent POST can prove it originated from this same authorize call
   * (see verifyCsrf).
   */
  @Get('authorize')
  @UseGuards(OptionalJwtAuthGuard)
  async authorize(
    @Query() query: AuthorizeParams,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // This endpoint is entered as a top-level browser navigation (from the AI
    // client), so there is no Authorization header — auth rides on the CRM
    // session cookie. If the browser has no valid session on this (backend)
    // domain, redirect to the CRM login and come back here afterwards with the
    // OAuth params preserved, instead of dead-ending on a 401.
    const user = req.user as User | undefined;
    if (!user) {
      const returnTo = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const frontendUrl = (this.configService.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
      const loginUrl = `${frontendUrl}/login?returnTo=${encodeURIComponent(returnTo)}`;
      res.redirect(302, loginUrl);
      return;
    }

    const { client, scopes } = await this.validateAuthorizeParams(query);

    const nonce = this.mcpOauthService.issueConsentNonce({
      userId: user.id,
      clientId: client.clientId,
    });

    res.cookie(CONSENT_NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isProduction(),
      maxAge: CONSENT_NONCE_MAX_AGE_MS,
      path: '/',
    });

    const html = renderConsentPage({
      clientId: client.clientId,
      clientName: client.clientName,
      workspaceName: user.workspace?.name ?? '',
      scopes,
      redirectUri: query.redirect_uri,
      responseType: query.response_type ?? 'code',
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
      state: query.state,
      csrf: nonce,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /**
   * POST /api/v1/oauth/mcp/authorize/consent
   * Re-validates the same params, verifies the CSRF nonce, and only then
   * either issues a grant + auth code (decision=approve) or denies
   * (anything else, including missing/malformed decision — fail closed).
   */
  @Post('authorize/consent')
  @UseGuards(JwtAuthGuard)
  async consent(
    @Body() body: ConsentParams,
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { client, scopes } = await this.validateAuthorizeParams(body);

    this.verifyCsrf(req, body, client.clientId, user.id);
    res.clearCookie(CONSENT_NONCE_COOKIE, { path: '/' });

    if (body.decision !== 'approve') {
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
   * CSRF guard for the consent POST: the nonce must be present in BOTH the
   * cookie (SameSite=strict — a cross-site forged POST can't attach it)
   * and the form body, the two must match, the JWT signature/expiry must
   * verify, and the embedded userId/clientId must match the authenticated
   * user and the client being consented to. Any mismatch is a 403 — never
   * proceeds to grant/code issuance.
   */
  private verifyCsrf(req: Request, body: ConsentParams, clientId: string, userId: string): void {
    const cookieNonce = req.cookies?.[CONSENT_NONCE_COOKIE];
    const formNonce = body.csrf;

    if (!cookieNonce || !formNonce || cookieNonce !== formNonce) {
      throw new ForbiddenException('invalid_csrf_nonce');
    }

    const payload = this.mcpOauthService.verifyConsentNonce(formNonce);

    if (!payload || payload.userId !== userId || payload.clientId !== clientId) {
      throw new ForbiddenException('invalid_csrf_nonce');
    }
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

  private isProduction(): boolean {
    return this.configService.get('NODE_ENV', 'development') === 'production';
  }
}
