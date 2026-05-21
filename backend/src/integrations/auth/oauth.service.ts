import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHmac, randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';
import { IntegrationRegistry } from '../registry/integration.registry';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  providerKey?: string;
  authorizeClientParam?: 'client_id' | 'client_key';
  tokenClientParam?: 'client_id' | 'client_key';
  scopeDelimiter?: 'space' | 'comma';
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly stateSecret: string;
  private readonly stateTtlMs = 10 * 60 * 1000;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private integrationRegistry: IntegrationRegistry,
  ) {
    // Use dedicated OAuth state secret for CSRF protection
    this.stateSecret = this.configService.get<string>('auth.oauthStateSecret');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!this.stateSecret) {
      if (nodeEnv === 'production') {
        const error = 'OAUTH_STATE_SECRET is required for OAuth flows in production. Configure it in environment variables (minimum 32 characters).';
        this.logger.error(error);
        throw new Error(error);
      }
      // In development, fall back to JWT secret with a warning
      this.stateSecret = this.configService.get<string>('auth.jwtSecret') || 'dev-fallback-not-for-production';
      this.logger.warn(
        'OAUTH_STATE_SECRET not set - using JWT_SECRET as fallback for OAuth state. ' +
        'Set OAUTH_STATE_SECRET in production!'
      );
    }

    if (this.stateSecret.length < 32) {
      const error = 'OAUTH_STATE_SECRET must be at least 32 characters long for security.';
      this.logger.error(error);
      throw new Error(error);
    }
  }

  /**
   * Get OAuth configuration for integration type
   */
  private getOAuthConfig(integration: Integration): OAuthConfig {
    const type = integration.type;
    const configs: Record<IntegrationType, Partial<OAuthConfig>> = {
      [IntegrationType.SLACK]: {
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        revokeUrl: 'https://slack.com/api/auth.revoke',
      },
      [IntegrationType.GOOGLE]: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        revokeUrl: 'https://oauth2.googleapis.com/revoke',
      },
      [IntegrationType.MICROSOFT]: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      },
      [IntegrationType.SALESFORCE]: {
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        revokeUrl: 'https://login.salesforce.com/services/oauth2/revoke',
      },
      [IntegrationType.HUBSPOT]: {
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
      },
      [IntegrationType.PIPEDRIVE]: {
        authUrl: 'https://oauth.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
      },
      [IntegrationType.ZOOM]: {
        authUrl: 'https://zoom.us/oauth/authorize',
        tokenUrl: 'https://zoom.us/oauth/token',
        revokeUrl: 'https://zoom.us/oauth/revoke',
      },
      [IntegrationType.DOCUSIGN]: {
        authUrl: 'https://account.docusign.com/oauth/auth',
        tokenUrl: 'https://account.docusign.com/oauth/token',
      },
      [IntegrationType.CALENDLY]: {
        authUrl: 'https://auth.calendly.com/oauth/authorize',
        tokenUrl: 'https://auth.calendly.com/oauth/token',
        revokeUrl: 'https://auth.calendly.com/oauth/token/revoke',
      },
      // Non-OAuth integrations have empty configs
      [IntegrationType.PANDADOC]: {},
      [IntegrationType.TYPEFORM]: {},
      [IntegrationType.WHATSAPP]: {},
      [IntegrationType.KAJABI]: {},
      [IntegrationType.CALENDAR]: {},
      [IntegrationType.EMAIL]: {},
      [IntegrationType.SMS]: {},
      [IntegrationType.SOCIAL_MEDIA]: {},
      [IntegrationType.WEBHOOK]: {},
      [IntegrationType.API]: {},
      [IntegrationType.DATABASE]: {},
      [IntegrationType.CUSTOM]: {},
      [IntegrationType.MANYCHAT]: {},
    };

    let baseConfig = configs[type];
    let envPrefixes = [type.toUpperCase()];
    let defaultScopes: string[] = [];
    let authorizeClientParam: 'client_id' | 'client_key' = 'client_id';
    let tokenClientParam: 'client_id' | 'client_key' = 'client_id';
    let scopeDelimiter: 'space' | 'comma' = 'space';
    let providerKey: string | undefined;

    if (type === IntegrationType.API) {
      providerKey = this.getApiOAuthProviderKey(integration);
      const apiProviderConfigs: Record<string, {
        authUrl: string;
        tokenUrl: string;
        revokeUrl?: string;
        defaultScopes: string[];
        envPrefixes: string[];
        authorizeClientParam?: 'client_id' | 'client_key';
        tokenClientParam?: 'client_id' | 'client_key';
        scopeDelimiter?: 'space' | 'comma';
      }> = {
        facebook: {
          authUrl: 'https://www.facebook.com/v23.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v23.0/oauth/access_token',
          defaultScopes: [
            'public_profile',
            'email',
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_metadata',
            'pages_messaging',
            'leads_retrieval',
          ],
          envPrefixes: ['FACEBOOK'],
        },
        instagram: {
          authUrl: 'https://www.facebook.com/v23.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v23.0/oauth/access_token',
          defaultScopes: [
            'public_profile',
            'email',
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_metadata',
            'instagram_basic',
            'instagram_manage_comments',
            'instagram_manage_messages',
          ],
          envPrefixes: ['INSTAGRAM', 'FACEBOOK'],
        },
        tiktok: {
          authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
          tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
          defaultScopes: ['user.info.basic'],
          envPrefixes: ['TIKTOK'],
          authorizeClientParam: 'client_key',
          tokenClientParam: 'client_key',
          scopeDelimiter: 'comma',
        },
      };

      const providerConfig = providerKey ? apiProviderConfigs[providerKey] : undefined;
      if (!providerConfig) {
        throw new BadRequestException(`OAuth not supported for API provider: ${providerKey || 'unknown'}`);
      }

      baseConfig = providerConfig;
      envPrefixes = providerConfig.envPrefixes;
      defaultScopes = providerConfig.defaultScopes;
      authorizeClientParam = providerConfig.authorizeClientParam || authorizeClientParam;
      tokenClientParam = providerConfig.tokenClientParam || tokenClientParam;
      scopeDelimiter = providerConfig.scopeDelimiter || scopeDelimiter;
    }

    if (!baseConfig || !baseConfig.authUrl) {
      throw new BadRequestException(`OAuth not supported for integration type: ${type}`);
    }

    const readFirstEnvValue = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = this.configService.get<string>(key);
        if (value) {
          return value;
        }
      }
      return undefined;
    };

    // Get client credentials
    const clientIdCandidates = envPrefixes.flatMap((prefix) =>
      tokenClientParam === 'client_key'
        ? [`OAUTH_${prefix}_CLIENT_KEY`, `OAUTH_${prefix}_CLIENT_ID`]
        : [`OAUTH_${prefix}_CLIENT_ID`, `OAUTH_${prefix}_CLIENT_KEY`]
    );
    const clientSecretCandidates = envPrefixes.map((prefix) => `OAUTH_${prefix}_CLIENT_SECRET`);

    let clientId = readFirstEnvValue(clientIdCandidates);
    let clientSecret = readFirstEnvValue(clientSecretCandidates);

    // Reuse existing Meta app credentials (already used by WhatsApp embedded signup)
    // when dedicated Facebook/Instagram OAuth vars are not configured yet.
    if ((!clientId || !clientSecret) && (providerKey === 'facebook' || providerKey === 'instagram')) {
      clientId = clientId || this.configService.get<string>('META_APP_ID');
      clientSecret = clientSecret || this.configService.get<string>('META_APP_SECRET');
    }

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        `OAuth credentials not configured for ${providerKey || type}. Please contact your administrator.`
      );
    }

    // Get redirect URI - use specific env var or construct from APP_URL
    let redirectUri = readFirstEnvValue(envPrefixes.map((prefix) => `OAUTH_${prefix}_REDIRECT_URI`));

    if (!redirectUri) {
      // Fallback: construct from APP_URL
      const appUrl = this.configService.get('APP_URL') || 'http://localhost:3000';
      // Ensure APP_URL doesn't already end with /api/v1
      const baseUrl = appUrl.replace(/\/api\/v1\/?$/, '');
      redirectUri = `${baseUrl}/api/v1/integrations/oauth/callback`;
    }

    // Get scopes (from env or default)
    const scopesEnv = readFirstEnvValue(envPrefixes.map((prefix) => `OAUTH_${prefix}_SCOPES`));
    let scopes: string[] = defaultScopes;

    if (scopesEnv) {
      scopes = scopesEnv.split(',').map((s: string) => s.trim());
    }

    // If no scopes in env, use empty array (will be handled by generateAuthUrl)
    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes,
      providerKey,
      authorizeClientParam,
      tokenClientParam,
      scopeDelimiter,
      ...baseConfig,
    } as OAuthConfig;
  }

  private getApiOAuthProviderKey(integration: Integration): string | null {
    const rawProvider = String(integration.config?.provider || integration.externalId || '').trim().toLowerCase();
    if (!rawProvider) {
      return null;
    }
    if (rawProvider === 'fb' || rawProvider === 'meta-facebook') {
      return 'facebook';
    }
    if (rawProvider === 'ig' || rawProvider === 'meta-instagram') {
      return 'instagram';
    }
    return rawProvider;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(integration: Integration, state?: string): string {
    const config = this.getOAuthConfig(integration);

    // Get scopes from: integration config > OAuth config > registry defaults
    let scopes = integration.config?.scopes || config.scopes;

    // If still no scopes, try to get from registry
    if (!scopes || scopes.length === 0) {
      const metadata = this.integrationRegistry.getIntegrationMetadata(integration.type);
      scopes = metadata?.defaultConfig?.scopes || [];
    }

    const params = new URLSearchParams();
    params.append(config.authorizeClientParam || 'client_id', config.clientId);
    params.append('redirect_uri', config.redirectUri);
    params.append(
      'scope',
      Array.isArray(scopes)
        ? scopes.join(config.scopeDelimiter === 'comma' ? ',' : ' ')
        : scopes
    );
    params.append('response_type', 'code');
    params.append('state', state || this.generateState(integration));

    // Add integration-specific parameters
    switch (integration.type) {
      case IntegrationType.SLACK:
        params.append('user_scope', 'identity.basic');
        break;
      case IntegrationType.MICROSOFT:
        params.append('response_mode', 'query');
        break;
      case IntegrationType.SALESFORCE:
        params.append('prompt', 'consent');
        break;
      case IntegrationType.GOOGLE:
        params.append('access_type', 'offline');
        // Use both select_account and consent to force fresh authorization
        params.append('prompt', 'select_account consent');
        params.append('include_granted_scopes', 'true');
        break;
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;
    this.logger.log(`Generated OAuth URL for ${integration.type} (${integration.id})`);
    this.logger.log(`OAuth parameters: ${JSON.stringify(Object.fromEntries(params))}`);

    return authUrl;
  }

  /**
   * Generate signed state to prevent tampering/CSRF
   */
  generateState(integration: Integration): string {
    const payload = {
      integrationId: integration.id,
      workspaceId: integration.workspaceId,
      nonce: randomBytes(12).toString('hex'),
      ts: Date.now(),
    };
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr).toString('base64url');
    const sig = createHmac('sha256', this.stateSecret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  /**
   * Validate and decode state token
   */
  validateState(state?: string): { integrationId: string; workspaceId: string } {
    if (!state || !state.includes('.')) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const [payloadB64, sig] = state.split('.');
    const expectedSig = createHmac('sha256', this.stateSecret).update(payloadB64).digest('base64url');

    if (!this.timingSafeEqual(expectedSig, sig)) {
      throw new UnauthorizedException('Invalid OAuth state signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
      integrationId: string;
      workspaceId: string;
      ts: number;
    };

    if (!payload.integrationId || !payload.workspaceId) {
      throw new UnauthorizedException('Invalid OAuth state payload');
    }

    if (Date.now() - payload.ts > this.stateTtlMs) {
      throw new UnauthorizedException('OAuth state expired');
    }

    return {
      integrationId: payload.integrationId,
      workspaceId: payload.workspaceId,
    };
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return cryptoTimingSafeEqual(bufA, bufB);
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(integration: Integration, code: string): Promise<OAuthTokens> {
    const config = this.getOAuthConfig(integration);

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set(config.tokenClientParam || 'client_id', config.clientId);
    params.set('client_secret', config.clientSecret);
    params.set('code', code);
    params.set('redirect_uri', config.redirectUri);

    this.logger.log(`Exchanging code for tokens - Integration: ${integration.id}, Type: ${integration.type}`);

    try {
      const isMetaSocialApiProvider =
        integration.type === IntegrationType.API &&
        (config.providerKey === 'facebook' || config.providerKey === 'instagram');
      const response = isMetaSocialApiProvider
        ? await firstValueFrom(
            this.httpService.get(config.tokenUrl, {
              params: Object.fromEntries(params),
            })
          )
        : await firstValueFrom(
            this.httpService.post(config.tokenUrl, params.toString(), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            })
          );

      const data = response.data?.data || response.data;

      this.logger.log(`Token response received for ${integration.id}`);
      this.logger.log(`Response has access_token: ${!!data.access_token}`);
      this.logger.log(`Response has refresh_token: ${!!data.refresh_token}`);
      this.logger.log(`Response keys: ${Object.keys(data).join(', ')}`);

      // Handle different response formats
      const accessToken = data.access_token || data.accessToken;
      const refreshToken = data.refresh_token || data.refreshToken;
      const expiresIn = data.expires_in || data.expiresIn;
      const tokenType = data.token_type || data.tokenType || 'Bearer';
      const scope = data.scope;

      if (!accessToken) {
        this.logger.error(`No access token in response: ${JSON.stringify(data)}`);
        throw new BadRequestException('No access token received from OAuth provider');
      }

      const tokens: OAuthTokens = {
        accessToken,
        refreshToken,
        tokenType,
        scope,
      };

      if (expiresIn) {
        tokens.expiresAt = new Date(Date.now() + expiresIn * 1000);
      }

      this.logger.log(`OAuth tokens obtained for integration ${integration.id} - Has refresh token: ${!!refreshToken}`);

      return tokens;
    } catch (error) {
      this.logger.error(`OAuth token exchange failed for integration ${integration.id}:`, error.message);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException(`OAuth authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(integration: Integration): Promise<OAuthTokens> {
    if (!integration.credentials?.refreshToken) {
      throw new BadRequestException('No refresh token available');
    }

    const config = this.getOAuthConfig(integration);

    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set(config.tokenClientParam || 'client_id', config.clientId);
    params.set('client_secret', config.clientSecret);
    params.set('refresh_token', integration.credentials.refreshToken);

    try {
      const response = await firstValueFrom(
        this.httpService.post(config.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const data = response.data?.data || response.data;

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || integration.credentials.refreshToken,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope,
      };

      if (data.expires_in) {
        tokens.expiresAt = new Date(Date.now() + data.expires_in * 1000);
      }

      this.logger.log(`OAuth tokens refreshed for integration ${integration.id}`);

      return tokens;
    } catch (error) {
      this.logger.error(`OAuth token refresh failed for integration ${integration.id}:`, error);
      throw new BadRequestException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(integration: Integration): Promise<void> {
    const config = this.getOAuthConfig(integration);

    if (!config.revokeUrl || !integration.credentials?.accessToken) {
      return;
    }

    try {
      const params = new URLSearchParams({
        token: integration.credentials.accessToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      await firstValueFrom(
        this.httpService.post(config.revokeUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      this.logger.log(`OAuth tokens revoked for integration ${integration.id}`);
    } catch (error) {
      this.logger.warn(`Failed to revoke OAuth tokens for integration ${integration.id}:`, error);
      // Don't throw error as token revocation is not critical
    }
  }

  /**
   * Validate OAuth tokens
   */
  async validateTokens(integration: Integration): Promise<boolean> {
    if (!integration.credentials?.accessToken) {
      return false;
    }

    // Check if token is expired
    if (integration.credentials.expiresAt && new Date(integration.credentials.expiresAt) <= new Date()) {
      return false;
    }

    // Make a test API call to validate token
    try {
      switch (integration.type) {
        case IntegrationType.SLACK:
          await firstValueFrom(
            this.httpService.get('https://slack.com/api/auth.test', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        case IntegrationType.GOOGLE:
          await firstValueFrom(
            this.httpService.get('https://www.googleapis.com/oauth2/v1/tokeninfo', {
              params: {
                access_token: integration.credentials.accessToken,
              },
            })
          );
          break;

        case IntegrationType.MICROSOFT:
          await firstValueFrom(
            this.httpService.get('https://graph.microsoft.com/v1.0/me', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        case IntegrationType.SALESFORCE:
          // Salesforce doesn't have a direct token validation endpoint
          // We'll assume valid if not expired
          break;

        case IntegrationType.HUBSPOT:
          await firstValueFrom(
            this.httpService.get('https://api.hubapi.com/oauth/v1/access-tokens/' + integration.credentials.accessToken)
          );
          break;

        case IntegrationType.ZOOM:
          await firstValueFrom(
            this.httpService.get('https://api.zoom.us/v2/users/me', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        default:
          return true; // Assume valid for unknown types
      }

      return true;
    } catch (error) {
      this.logger.warn(`Token validation failed for integration ${integration.id}:`, error);
      return false;
    }
  }

  /**
   * Get user info from OAuth provider
   */
  async getUserInfo(integration: Integration): Promise<any> {
    if (!integration.credentials?.accessToken) {
      throw new BadRequestException('No access token available');
    }

    try {
      let response;

      switch (integration.type) {
        case IntegrationType.SLACK:
          response = await firstValueFrom(
            this.httpService.get('https://slack.com/api/users.identity', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        case IntegrationType.GOOGLE:
          response = await firstValueFrom(
            this.httpService.get('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        case IntegrationType.MICROSOFT:
          response = await firstValueFrom(
            this.httpService.get('https://graph.microsoft.com/v1.0/me', {
              headers: {
                Authorization: `Bearer ${integration.credentials.accessToken}`,
              },
            })
          );
          break;

        default:
          throw new BadRequestException(`User info not available for integration type: ${integration.type}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get user info for integration ${integration.id}:`, error);
      throw new BadRequestException(`Failed to get user info: ${error.message}`);
    }
  }
}
