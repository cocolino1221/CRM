import { IsOptional, IsString } from 'class-validator';

/**
 * `POST /api/v1/oauth/mcp/token` request body (RFC 6749 §4.1.3 /
 * §6). Field names are snake_case to match the wire format OAuth/MCP
 * clients send.
 *
 * All fields are optional at the DTO level — `McpOauthController.token()`
 * and `McpOauthService.exchangeCode()`/`refresh()` are responsible for
 * the "required for this grant_type" enforcement (mirroring how
 * `AuthorizeParams`/`ConsentParams` are validated manually in
 * `mcp-oauth.controller.ts` rather than via class-validator), because
 * requiredness here is CONDITIONAL on `grant_type` — a bare `@IsString()`
 * on, say, `code` would 400 a `grant_type=refresh_token` request that
 * never sends it.
 *
 * `code_verifier` is deliberately NOT `@IsString()`-validated. If it
 * were, NestJS's ValidationPipe would reject a wrong-typed value (e.g. a
 * JSON number/object) BEFORE the request ever reaches the controller,
 * with Nest's generic `{statusCode, message, error: 'Bad Request'}` body
 * — not the RFC 6749 `{error: 'invalid_grant', ...}` shape OAuth clients
 * expect from this endpoint. Leaving it untyped here lets a malformed
 * value flow through to `McpOauthService.exchangeCode()`'s own
 * `typeof codeVerifier !== 'string'` guard, which throws the correctly
 * shaped `McpOAuthTokenException('invalid_grant', ...)` instead.
 */
export class TokenRequestDto {
  @IsOptional()
  @IsString()
  grant_type?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  code_verifier?: unknown;

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @IsOptional()
  @IsString()
  refresh_token?: string;
}
