import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OAuth 2.0 Authorization Server / Protected Resource discovery metadata
 * (RFC 8414 / RFC 9728). These routes are excluded from the global `api/v1`
 * prefix in main.ts (and in test/mcp/helpers.ts) so they resolve at root,
 * as required by the MCP OAuth discovery convention.
 */
@Controller()
export class WellKnownController {
  constructor(private readonly configService: ConfigService) {}

  @Get('.well-known/oauth-authorization-server')
  getAuthorizationServerMetadata() {
    const issuer = this.getAppUrl();

    return {
      issuer,
      authorization_endpoint: `${issuer}/api/v1/oauth/mcp/authorize`,
      token_endpoint: `${issuer}/api/v1/oauth/mcp/token`,
      registration_endpoint: `${issuer}/api/v1/oauth/mcp/register`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: ['crm.read', 'crm.write', 'crm.automations'],
    };
  }

  @Get('.well-known/oauth-protected-resource')
  getProtectedResourceMetadata() {
    const resource = this.getAppUrl();

    return {
      resource,
      authorization_servers: [resource],
    };
  }

  private getAppUrl(): string {
    return this.configService.get<string>('APP_URL', 'https://slackcrm-backend.fly.dev');
  }
}
