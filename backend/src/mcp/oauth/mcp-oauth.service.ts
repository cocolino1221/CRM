import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { McpOauthClient } from '../../database/entities/mcp-oauth-client.entity';
import { RegisterClientDto } from './dto/register-client.dto';

@Injectable()
export class McpOauthService {
  constructor(
    @InjectRepository(McpOauthClient)
    private readonly clientRepository: Repository<McpOauthClient>,
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
}
