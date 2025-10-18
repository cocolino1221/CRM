import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';

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
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  /**
   * Get OAuth configuration for integration type
   */
  private getOAuthConfig(type: IntegrationType): OAuthConfig {
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
      // Non-OAuth integrations have empty configs
      [IntegrationType.TYPEFORM]: {},
      [IntegrationType.CALENDAR]: {},
      [IntegrationType.EMAIL]: {},
      [IntegrationType.SMS]: {},
      [IntegrationType.SOCIAL_MEDIA]: {},
      [IntegrationType.WEBHOOK]: {},
      [IntegrationType.API]: {},
      [IntegrationType.DATABASE]: {},
      [IntegrationType.CUSTOM]: {},
    };

    const baseConfig = configs[type];
    if (!baseConfig) {
      throw new BadRequestException(`OAuth not supported for integration type: ${type}`);
    }

    const envPrefix = type.toUpperCase();

    return {
      clientId: this.configService.get(`OAUTH_${envPrefix}_CLIENT_ID`),
      clientSecret: this.configService.get(`OAUTH_${envPrefix}_CLIENT_SECRET`),
      redirectUri: this.configService.get(`OAUTH_${envPrefix}_REDIRECT_URI`) ||
                   `${this.configService.get('APP_URL')}/integrations/oauth/callback`,
      scopes: this.configService.get(`OAUTH_${envPrefix}_SCOPES`)?.split(',') || [],
      ...baseConfig,
    } as OAuthConfig;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(integration: Integration, state?: string): string {
    const config = this.getOAuthConfig(integration.type);
    const scopes = integration.config?.scopes || config.scopes;

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: scopes.join(' '),
      response_type: 'code',
      state: state || integration.id,
    });

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
    }

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(integration: Integration, code: string): Promise<OAuthTokens> {
    const config = this.getOAuthConfig(integration.type);

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(config.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const data = response.data;

      // Handle different response formats
      const accessToken = data.access_token || data.accessToken;
      const refreshToken = data.refresh_token || data.refreshToken;
      const expiresIn = data.expires_in || data.expiresIn;
      const tokenType = data.token_type || data.tokenType || 'Bearer';
      const scope = data.scope;

      if (!accessToken) {
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

      this.logger.log(`OAuth tokens obtained for integration ${integration.id}`);

      return tokens;
    } catch (error) {
      this.logger.error(`OAuth token exchange failed for integration ${integration.id}:`, error);
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

    const config = this.getOAuthConfig(integration.type);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: integration.credentials.refreshToken,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(config.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const data = response.data;

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
    const config = this.getOAuthConfig(integration.type);

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