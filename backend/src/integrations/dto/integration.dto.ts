import { IsEnum, IsString, IsOptional, IsBoolean, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IntegrationType, IntegrationAuthType } from '../../database/entities/integration.entity';

export class InstallIntegrationDto {
  @ApiProperty({ enum: IntegrationType })
  @IsEnum(IntegrationType)
  type: IntegrationType;

  @ApiProperty({ enum: IntegrationAuthType })
  @IsEnum(IntegrationAuthType)
  authType: IntegrationAuthType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class CreateIntegrationDto extends InstallIntegrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;
}

export class IntegrationConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  syncFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  syncDirection?: 'bidirectional' | 'inbound' | 'outbound';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rateLimit?: {
    requests: number;
    period: string;
  };
}

export class IntegrationCredentialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  token?: string;
}

export class SyncOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direction?: 'inbound' | 'outbound' | 'bidirectional';

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class WebhookDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsString()
  event: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class OAuthCallbackDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}

export class BulkInstallDto {
  @ApiProperty({ type: [InstallIntegrationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallIntegrationDto)
  integrations: InstallIntegrationDto[];
}

export class BulkSyncDto {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  integrationIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  options?: SyncOptionsDto;
}