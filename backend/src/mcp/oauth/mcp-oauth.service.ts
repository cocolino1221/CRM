import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { McpOauthClient } from '../../database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../../database/entities/mcp-refresh-token.entity';
import { RegisterClientDto } from './dto/register-client.dto';
import { UserRole } from '../../database/entities/user.entity';
import { McpTokenService } from '../auth/mcp-token.service';

export interface AuthCodePayload {
  clientId: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  scopes: string[];
  codeChallenge: string;
  redirectUri: string;
}

export interface UpsertGrantParams {
  workspaceId: string;
  userId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
}

export interface ConsentNoncePayload {
  userId: string;
  clientId: string;
}

export interface ExchangeCodeParams {
  // Typed `unknown` (not `string`) deliberately: these arrive from an
  // unauthenticated public endpoint via a loosely-validated DTO (see
  // TokenRequestDto — code_verifier is intentionally NOT
  // class-validator-enforced so a wrong-typed value reaches this service's
  // own typeof guards and gets a spec-shaped OAuth error instead of
  // NestJS's generic ValidationPipe 400). Never assume these are strings
  // without checking first.
  code?: unknown;
  codeVerifier?: unknown;
  clientId?: unknown;
  redirectUri?: unknown;
}

export interface RefreshParams {
  refreshToken?: unknown;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * RFC 6749 §5.2 token-endpoint error response. Rendered as HTTP 400 with
 * body `{ error, error_description? }` — deliberately NOT NestJS's default
 * `{statusCode, message, error}` shape, since OAuth clients (and the spec)
 * expect `error` to be the machine-readable code itself.
 *
 * Also includes a `message` field aliased to `error_description` (falling
 * back to the OAuth error code itself). Production wires
 * `AllExceptionsFilter` globally (see main.ts), which reshapes every
 * HttpException's response via
 * `message = exceptionResponse.message || exception.message` and
 * `error = exceptionResponse.error || error`. Without an explicit
 * `message` here, that filter would fall back to `exception.message`
 * (HttpException's own generic message string) instead of our
 * OAuth-specific description — `error: 'invalid_grant'` still survives
 * either way (the filter reads `.error` off our body directly), but this
 * keeps `message` meaningful too.
 */
export class McpOAuthTokenException extends HttpException {
  constructor(
    public readonly oauthError: 'invalid_request' | 'invalid_grant' | 'unsupported_grant_type',
    errorDescription?: string,
  ) {
    super(
      {
        error: oauthError,
        ...(errorDescription ? { error_description: errorDescription } : {}),
        message: errorDescription ?? oauthError,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Injectable()
export class McpOauthService {
  /**
   * In-memory single-use tracking for authorization codes (RFC 6749
   * §4.1.2: "The client MUST NOT use the authorization code more than
   * once"). The auth code itself is a short-lived (60s) stateless JWT, so
   * there's no DB row to mark consumed; a process-local Set is sufficient
   * here since codes expire well within any reasonable single-instance
   * uptime and the entry is only ever added, never looked up after
   * expiry-length has passed in practice. Not shared across instances —
   * acceptable for this deployment's single Fly machine (see
   * project_neon_cost_autosuspend memory: MCP intentionally avoids adding
   * new persisted/polled state).
   */
  private readonly usedAuthCodes = new Set<string>();

  constructor(
    @InjectRepository(McpOauthClient)
    private readonly clientRepository: Repository<McpOauthClient>,
    @InjectRepository(McpOauthGrant)
    private readonly grantRepository: Repository<McpOauthGrant>,
    @InjectRepository(McpRefreshToken)
    private readonly refreshTokenRepository: Repository<McpRefreshToken>,
    private readonly jwtService: JwtService,
    private readonly mcpTokenService: McpTokenService,
  ) {}

  /**
   * RFC 7591 Dynamic Client Registration.
   * Validates redirect_uris (non-empty array of https URLs), mints a
   * client_id, and persists the client.
   */
  async registerClient(dto: RegisterClientDto): Promise<McpOauthClient> {
    const redirectUris = dto?.redirect_uris;

    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris must be a non-empty array');
    }

    for (const uri of redirectUris) {
      if (typeof uri !== 'string' || !uri.startsWith('https://')) {
        throw new BadRequestException('redirect_uris must all be https:// URLs');
      }
    }

    const client = this.clientRepository.create({
      clientId: `mcp_${randomUUID()}`,
      redirectUris,
      clientName: dto.client_name || 'Unnamed MCP Client',
      clientUri: dto.client_uri || null,
    });

    return this.clientRepository.save(client);
  }

  /**
   * Look up a registered MCP OAuth client by its public client_id.
   */
  async findClientByClientId(clientId: string): Promise<McpOauthClient | null> {
    if (!clientId) return null;
    return this.clientRepository.findOne({ where: { clientId } });
  }

  /**
   * Create or update the (workspaceId, userId, clientId) grant with the
   * latest approved scopes. Un-revokes a previously revoked grant.
   */
  async upsertGrant(params: UpsertGrantParams): Promise<McpOauthGrant> {
    const existing = await this.grantRepository.findOne({
      where: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        clientId: params.clientId,
      },
    });

    if (existing) {
      existing.clientName = params.clientName;
      existing.scopes = params.scopes;
      existing.revoked = false;
      return this.grantRepository.save(existing);
    }

    const grant = this.grantRepository.create({
      workspaceId: params.workspaceId,
      userId: params.userId,
      clientId: params.clientId,
      clientName: params.clientName,
      scopes: params.scopes,
    });

    return this.grantRepository.save(grant);
  }

  /**
   * Issue a short-lived (60s) signed authorization code embedding the PKCE
   * challenge and grant context. Verification/exchange happens at the token
   * endpoint (separate task) — this only mints the code.
   */
  issueAuthCode(payload: AuthCodePayload): string {
    return this.jwtService.sign(
      { ...payload, typ: 'mcp-auth-code' },
      { expiresIn: '60s' },
    );
  }

  /**
   * CSRF protection for the authorize -> consent hop. Mints a short-lived
   * (5min) signed nonce binding the consent POST to the specific
   * (user, client) pair that saw the GET consent screen. The same value is
   * set as a strict, httpOnly cookie AND embedded as a hidden form field —
   * a cross-site forged POST can't attach the cookie (SameSite=strict), so
   * the two values won't match at verification time.
   */
  issueConsentNonce(payload: ConsentNoncePayload): string {
    return this.jwtService.sign(
      { ...payload, typ: 'mcp-consent-nonce' },
      { expiresIn: '5m' },
    );
  }

  /**
   * Verifies signature, expiry, and token type of a consent nonce. Returns
   * null (never throws) on any failure — mirrors AuthService's
   * getOAuthStateSource pattern — so callers decide how to fail (403).
   */
  verifyConsentNonce(token: string): ConsentNoncePayload | null {
    if (!token) return null;

    let decoded: any;
    try {
      decoded = this.jwtService.verify(token);
    } catch {
      return null;
    }

    if (decoded?.typ !== 'mcp-consent-nonce' || !decoded.userId || !decoded.clientId) {
      return null;
    }

    return { userId: decoded.userId, clientId: decoded.clientId };
  }

  /**
   * Token endpoint: `grant_type=authorization_code`.
   * 1. Verify the auth-code JWT (typ 'mcp-auth-code', signature, expiry).
   * 2. Enforce single-use (RFC 6749 §4.1.2).
   * 3. PKCE: base64url(sha256(code_verifier)) must equal the embedded
   *    codeChallenge.
   * 4. redirect_uri/client_id in the request must match what's embedded in
   *    the code (bound at authorize/consent time).
   * 5. Load the (workspaceId,userId,clientId) grant; reject if missing/revoked.
   * 6. Issue + persist a fresh access/refresh token pair.
   */
  async exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse> {
    const { code, codeVerifier, clientId, redirectUri } = params;

    // Structural presence check first (covers undefined/missing fields —
    // RFC 6749 §5.2 invalid_request). This alone is NOT sufficient type
    // safety: a truthy non-string (e.g. a number or object body field)
    // would pass `!code` etc. and reach jwtService.verify/createHash
    // below untyped, so every field is also explicitly typeof-checked.
    if (
      typeof code !== 'string' ||
      !code ||
      typeof clientId !== 'string' ||
      !clientId ||
      typeof redirectUri !== 'string' ||
      !redirectUri
    ) {
      throw new McpOAuthTokenException(
        'invalid_request',
        'code, client_id, and redirect_uri are required strings',
      );
    }

    // code_verifier gets its own dedicated check (rather than folding into
    // the invalid_request bucket above): a malformed/wrong-typed
    // code_verifier is the specific input that used to reach
    // `crypto.createHash(...).update(codeVerifier)` untyped and crash with
    // an uncaught TypeError (500) — createHash.update() only accepts a
    // string/Buffer/TypedArray. Guarding it here, before that call, turns
    // any non-string value into a clean 400 invalid_grant instead.
    if (typeof codeVerifier !== 'string' || codeVerifier.length === 0) {
      throw new McpOAuthTokenException('invalid_grant', 'code_verifier must be a non-empty string');
    }

    let payload: AuthCodePayload & { typ?: string };
    try {
      payload = this.jwtService.verify(code);
    } catch {
      throw new McpOAuthTokenException('invalid_grant', 'code is invalid or expired');
    }

    if (payload?.typ !== 'mcp-auth-code') {
      throw new McpOAuthTokenException('invalid_grant', 'code is invalid or expired');
    }

    if (this.usedAuthCodes.has(code)) {
      throw new McpOAuthTokenException('invalid_grant', 'code has already been used');
    }

    const expectedChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    if (expectedChallenge !== payload.codeChallenge) {
      throw new McpOAuthTokenException('invalid_grant', 'code_verifier does not match code_challenge');
    }

    if (payload.redirectUri !== redirectUri || payload.clientId !== clientId) {
      throw new McpOAuthTokenException('invalid_grant', 'redirect_uri or client_id mismatch');
    }

    const grant = await this.grantRepository.findOne({
      where: {
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        clientId: payload.clientId,
      },
    });

    if (!grant || grant.revoked) {
      throw new McpOAuthTokenException('invalid_grant', 'grant not found or revoked');
    }

    // Mark used only once every prior check has passed, so a code that
    // fails validation for any other reason can still be retried (a client
    // that sent the wrong verifier by mistake isn't permanently locked out).
    this.usedAuthCodes.add(code);

    return this.issueTokens({
      grant,
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      role: payload.role,
      scopes: payload.scopes,
    });
  }

  /**
   * Token endpoint: `grant_type=refresh_token`.
   * 1. Verify the refresh JWT (typ 'mcp-refresh').
   * 2. Look up its persisted row by jti; reject if missing/revoked/expired.
   * 3. Atomically claim it (conditional UPDATE, see below) so concurrent
   *    redemptions of the SAME refresh_token can't both succeed.
   * 4. Load the LIVE grant; reject if revoked.
   * 5. Mint + persist a new access/refresh pair using the grant's CURRENT
   *    scopes (not the stale snapshot on the old refresh-token row), and
   *    bump grant.lastUsedAt.
   */
  async refresh(params: RefreshParams): Promise<TokenResponse> {
    const { refreshToken } = params;

    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new McpOAuthTokenException('invalid_request', 'refresh_token is required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new McpOAuthTokenException('invalid_grant', 'refresh_token is invalid or expired');
    }

    if (payload?.typ !== 'mcp-refresh' || !payload.jti) {
      throw new McpOAuthTokenException('invalid_grant', 'refresh_token is invalid or expired');
    }

    const tokenRow = await this.refreshTokenRepository.findOne({ where: { jti: payload.jti } });

    if (!tokenRow || tokenRow.revoked || tokenRow.expiresAt.getTime() < Date.now()) {
      throw new McpOAuthTokenException('invalid_grant', 'refresh_token is invalid, revoked, or expired');
    }

    // Atomically claim this refresh token via a conditional UPDATE
    // (revoked:false -> true), rather than the previous find-then-save
    // pattern (load a snapshot, flip a JS boolean, save unconditionally).
    // That pattern was a TOCTOU race: two concurrent requests for the
    // SAME refresh_token could both observe revoked:false, then both
    // save(revoked:true) and both mint a fresh token pair
    // (double-redemption). A single-row `UPDATE ... WHERE jti = ? AND
    // revoked = false` is atomic at the database level — under
    // concurrent execution, Postgres serializes the two UPDATEs via its
    // normal row lock; only the one that runs first sees revoked:false
    // and flips it (affected === 1). The second blocks until the first
    // commits, then re-evaluates the WHERE clause against the now-true
    // value and matches zero rows (affected === 0) — so only ONE
    // concurrent caller ever proceeds past this point.
    const claim = await this.refreshTokenRepository.update(
      { jti: payload.jti, revoked: false },
      { revoked: true },
    );

    if (claim.affected !== 1) {
      throw new McpOAuthTokenException('invalid_grant', 'refresh_token has already been used');
    }

    const grant = await this.grantRepository.findOne({ where: { id: tokenRow.grantId } });

    if (!grant || grant.revoked) {
      throw new McpOAuthTokenException('invalid_grant', 'grant not found or revoked');
    }

    grant.lastUsedAt = new Date();
    await this.grantRepository.save(grant);

    return this.issueTokens({
      grant,
      workspaceId: tokenRow.workspaceId,
      userId: tokenRow.userId,
      role: payload.role,
      // Live grant scopes, not tokenRow.scopes (a snapshot frozen at the
      // time this refresh token was originally issued) — so a scope
      // change applied to the grant since then takes effect on the very
      // next refresh, rather than only after every outstanding refresh
      // token eventually expires.
      scopes: grant.scopes,
    });
  }

  /**
   * Mints an access token + a rotated refresh token, persists the new
   * refresh row, and shapes the OAuth token response.
   *
   * `role` is embedded as an extra (untyped-in-the-interface) field on the
   * refresh-token ctx so it round-trips through the signed JWT: the grant
   * row has no `role` column (and adding one — or querying the `User`
   * table, which this focused MCP module deliberately excludes from its
   * TypeORM entity list to avoid pulling in the whole
   * Contact/Deal/Task/Company relation graph — is out of scope here), yet
   * `refresh()` still needs the user's role to mint a fresh access token
   * on rotation without touching the User table.
   */
  private async issueTokens(ctx: {
    grant: McpOauthGrant;
    workspaceId: string;
    userId: string;
    role: UserRole;
    scopes: string[];
  }): Promise<TokenResponse> {
    const accessToken = this.mcpTokenService.issueAccessToken({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      role: ctx.role,
      scopes: ctx.scopes,
    });

    const refreshCtx: {
      grantId: string;
      workspaceId: string;
      userId: string;
      scopes: string[];
      role: UserRole;
    } = {
      grantId: ctx.grant.id,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      scopes: ctx.scopes,
      role: ctx.role,
    };
    const refresh = this.mcpTokenService.issueRefreshToken(refreshCtx);

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        jti: refresh.jti,
        grantId: ctx.grant.id,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        scopes: ctx.scopes,
        expiresAt: refresh.expiresAt,
        revoked: false,
      }),
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refresh.token,
      scope: ctx.scopes.join(' '),
    };
  }
}
