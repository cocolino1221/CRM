import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Ip,
  Res,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthResponse } from './interfaces/auth-response.interface';
import { Public } from '../common/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

/**
 * Authentication controller with comprehensive security
 * Handles user login, registration, token refresh, and profile management
 */
@ApiTags('Authentication')
@Controller('auth')
@UseGuards(ThrottlerGuard) // Rate limiting
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get cookie options for httpOnly, secure cookies
   */
  private getCookieOptions(isRefreshToken: boolean = false) {
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:4001');

    // Extract domain from frontend URL (for cross-subdomain cookies)
    let domain: string | undefined;
    try {
      const url = new URL(frontendUrl);
      // Only set domain for production with proper domain names
      if (nodeEnv === 'production' && !url.hostname.includes('localhost')) {
        // Extract root domain (e.g., example.com from app.example.com)
        const parts = url.hostname.split('.');
        if (parts.length > 2) {
          domain = `.${parts.slice(-2).join('.')}`;
        }
      }
    } catch {
      // If URL parsing fails, don't set domain
    }

    return {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      secure: nodeEnv === 'production', // HTTPS only in production
      sameSite: 'strict' as const, // CSRF protection
      path: '/',
      domain,
      maxAge: isRefreshToken
        ? 7 * 24 * 60 * 60 * 1000 // 7 days for refresh token
        : 15 * 60 * 1000, // 15 minutes for access token
    };
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute for login
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: 'object',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account locked',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResponse, 'accessToken' | 'refreshToken'>> {
    const result = await this.authService.login(loginDto, ipAddress);

    // Set httpOnly cookies for tokens (XSS protection)
    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    // Return response without tokens (they're in cookies now)
    const { accessToken, refreshToken, ...userResponse } = result;
    return userResponse;
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes for registration
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: 'object',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid registration data',
  })
  @ApiResponse({
    status: 409,
    description: 'User already exists',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResponse, 'accessToken' | 'refreshToken'>> {
    const result = await this.authService.register(registerDto);

    // Set httpOnly cookies for tokens
    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    // Return response without tokens (they're in cookies now)
    const { accessToken, refreshToken, ...userResponse } = result;
    return userResponse;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT tokens' })
  @ApiResponse({
    status: 200,
    description: 'Token refresh successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  async refreshTokens(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Extract refresh token from httpOnly cookie (or fallback to body for backward compatibility)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    // Set new httpOnly cookies
    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    return { message: 'Tokens refreshed successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout (blacklists current token)' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful - token has been blacklisted',
  })
  async logout(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
    @Body() body?: { refreshToken?: string }
  ): Promise<{ message: string }> {
    // Extract tokens from cookies or headers
    const accessToken = req.cookies?.accessToken ||
      (req.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : undefined);

    const refreshToken = req.cookies?.refreshToken || body?.refreshToken;

    // Clear httpOnly cookies
    res.clearCookie('accessToken', this.getCookieOptions(false));
    res.clearCookie('refreshToken', this.getCookieOptions(true));

    return this.authService.logout(req.user.id, accessToken, refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices (invalidate all user tokens)' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices successfully',
  })
  async logoutAll(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Clear httpOnly cookies
    res.clearCookie('accessToken', this.getCookieOptions(false));
    res.clearCookie('refreshToken', this.getCookieOptions(true));

    return this.authService.logoutAllDevices(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
  })
  async getCurrentUser(@Request() req) {
    try {
      // Fetch fresh user data from the service to ensure all fields are present
      const user = await this.authService.getProfile(req.user.id);

      return {
        id: user?.id || null,
        email: user?.email || null,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
        role: user?.role || null,
        workspaceId: user?.workspaceId || null,
        preferences: user?.preferences || {},
      };
    } catch (error) {
      console.error('Error in /auth/me endpoint:', error);
      // Return safe fallback instead of throwing
      return {
        id: req.user?.id || null,
        email: req.user?.email || null,
        firstName: req.user?.firstName || null,
        lastName: req.user?.lastName || null,
        role: req.user?.role || null,
        workspaceId: req.user?.workspaceId || null,
        preferences: {},
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user preferences' })
  @ApiResponse({
    status: 200,
    description: 'User preferences updated successfully',
  })
  async updateCurrentUser(@Request() req, @Body() updateData: { preferences?: any }) {
    return this.authService.updateProfile(req.user.id, updateData);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  async updateProfile(
    @Request() req,
    @Body() updateData: { firstName?: string; lastName?: string; email?: string },
  ) {
    return this.authService.updateProfile(req.user.id, updateData);
  }

  @UseGuards(JwtAuthGuard)
  @Put('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Current password is incorrect',
  })
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 600000 } }) // 3 requests per 10 minutes for password reset
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent (or message for security)',
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes for password reset
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-verification')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send email verification' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent',
  })
  async sendEmailVerification(@Request() req) {
    return this.authService.sendEmailVerification(req.user.id);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
  })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  // OAuth Authentication Routes
  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start Google OAuth login flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  async googleAuth(@Res() res: Response): Promise<void> {
    const googleClientId = this.configService.get('GOOGLE_CLIENT_ID');
    const callbackUrl = this.configService.get('GOOGLE_CALLBACK_URL');
    const state = this.authService.generateOAuthState();

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${googleClientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!this.authService.validateOAuthState(state)) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Invalid OAuth state')}`);
      return;
    }

    try {
      const authResponse = await this.authService.googleLogin(code);

      // Create short-lived auth code to avoid placing tokens in URL
      const authCode = this.authService.createOAuthAuthCode(authResponse);

      const encodedCode = encodeURIComponent(authCode);
      res.redirect(
        `${frontendUrl}/auth/callback?` +
        `code=${encodedCode}` +
        `&provider=google`
      );
    } catch (err) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`);
    }
  }

  @Public()
  @Get('slack')
  @ApiOperation({ summary: 'Start Slack OAuth login flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Slack OAuth' })
  async slackAuth(@Res() res: Response): Promise<void> {
    const slackClientId = this.configService.get('SLACK_CLIENT_ID');
    const callbackUrl = this.configService.get('SLACK_CALLBACK_URL') ||
      `${this.configService.get('BACKEND_URL')}/api/v1/auth/slack/callback`;
    const state = this.authService.generateOAuthState();

    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${slackClientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&user_scope=` +
      `&state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  }

  @Public()
  @Get('slack/callback')
  @ApiOperation({ summary: 'Handle Slack OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  async slackCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!this.authService.validateOAuthState(state)) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Invalid OAuth state')}`);
      return;
    }

    try {
      const authResponse = await this.authService.slackLogin(code);

      // Create short-lived auth code to avoid placing tokens in URL
      const authCode = this.authService.createOAuthAuthCode(authResponse);

      const encodedCode = encodeURIComponent(authCode);
      res.redirect(
        `${frontendUrl}/auth/callback?` +
        `code=${encodedCode}` +
        `&provider=slack`
      );
    } catch (err) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`);
    }
  }

  @Public()
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange short-lived auth code for tokens' })
  @ApiResponse({ status: 200, description: 'Auth code exchanged successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired auth code' })
  async exchangeOAuthCode(
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResponse, 'accessToken' | 'refreshToken'>> {
    const result = await this.authService.consumeOAuthAuthCode(code);

    // Set httpOnly cookies (same as login/register)
    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    // Return only user data (tokens are in cookies)
    const { accessToken, refreshToken, ...userResponse } = result;
    return userResponse;
  }
}
