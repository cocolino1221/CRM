import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The connect/update body. This endpoint used to type its body as a plain
 * object literal, which gives the global ValidationPipe nothing to validate
 * against and nothing to whitelist — any string of any size was stored,
 * which is how 2.7 KB of a pasted cURL command ended up in the token field.
 *
 * The bounds here are deliberately loose: what the token has to look like, and
 * the sentence explaining why a pasted value is not one, live in
 * meta-access-token.ts, so the person sees that instead of a generic
 * "accessToken must be shorter than ...".
 */
export class SaveMetaCapiConfigDto {
  @IsString()
  @IsNotEmpty({ message: 'Dataset ID is required.' })
  @MaxLength(64)
  datasetId: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  accessToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
