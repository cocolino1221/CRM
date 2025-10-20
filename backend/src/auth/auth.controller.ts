import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Ip,
  Res,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
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

  @Public()
  @Post('login')
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
  ): Promise<AuthResponse> {
    return this.authService.login(loginDto, ipAddress);
  }

  @Public()
  @Post('register')
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
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
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
    @Body('refreshToken') refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshTokens(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  async logout(@Request() req): Promise<{ message: string }> {
    return this.authService.logout(req.user.id);
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
    return {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      workspaceId: req.user.workspaceId,
    };
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
    @Body() passwordData: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.id, passwordData);
  }

  @Public()
  @Post('forgot-password')
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

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${googleClientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&prompt=consent`;

    res.redirect(authUrl);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
      return;
    }

    try {
      const authResponse = await this.authService.googleLogin(code);

      // Redirect to frontend with tokens in URL (will be stored in localStorage)
      res.redirect(
        `${frontendUrl}/auth/callback?` +
        `token=${authResponse.accessToken}` +
        `&refreshToken=${authResponse.refreshToken}` +
        `&user=${encodeURIComponent(JSON.stringify(authResponse.user))}`
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

    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${slackClientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&user_scope=`;

    res.redirect(authUrl);
  }

  @Public()
  @Get('slack/callback')
  @ApiOperation({ summary: 'Handle Slack OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  async slackCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
      return;
    }

    try {
      const authResponse = await this.authService.slackLogin(code);

      // Redirect to frontend with tokens
      res.redirect(
        `${frontendUrl}/auth/callback?` +
        `token=${authResponse.accessToken}` +
        `&refreshToken=${authResponse.refreshToken}` +
        `&user=${encodeURIComponent(JSON.stringify(authResponse.user))}`
      );
    } catch (err) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`);
    }
  }
}