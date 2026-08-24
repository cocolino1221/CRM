import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * RFC 7591 Dynamic Client Registration request body.
 * Field names are snake_case to match the wire format MCP clients send.
 */
export class RegisterClientDto {
  @IsOptional()
  @IsString()
  client_name?: string;

  @IsArray()
  redirect_uris: string[];

  @IsOptional()
  @IsString()
  client_uri?: string;
}
