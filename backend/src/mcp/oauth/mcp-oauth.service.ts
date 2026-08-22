import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { McpOauthClient } from '../../database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../database/entities/mcp-oauth-grant.entity';
import { RegisterClientDto } from './dto/register-client.dto';
import { UserRole } from '../../database/entities/user.entity';

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

@Injectable()
export class McpOauthService {
  constructor(
    @InjectRepository(McpOauthClient)
    private readonly clientRepository: Repository<McpOauthClient>,
    @InjectRepository(McpOauthGrant)
    private readonly grantRepository: Repository<McpOauthGrant>,
    private readonly jwtService: JwtService,
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
}
