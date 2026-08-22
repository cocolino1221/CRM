import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { McpOauthService } from './mcp-oauth.service';
import { RegisterClientDto } from './dto/register-client.dto';

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
}
