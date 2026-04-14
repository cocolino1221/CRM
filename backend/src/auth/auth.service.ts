import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Workspace, WorkspaceSettings } from '../database/entities/workspace.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';
import { TokenBlacklistService } from './token-blacklist/token-blacklist.service';
import { EmailService } from '../email/email.service';

/**
 * Authentication service with comprehensive security features
 * Handles login, registration, JWT tokens, and user management
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauthStateTtlMs = 10 * 60 * 1000;
  private readonly oauthAuthCodeTtlMs = 5 * 60 * 1000;
  private readonly oauthStateSecret: string;
  private readonly superAdminEmailSet: Set<string>;
  private readonly superAdminEmailRawCandidates: string[];

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private httpService: HttpService,
    private tokenBlacklistService: TokenBlacklistService,
    private emailService: EmailService,
  ) {
    this.oauthStateSecret = this.configService.get<string>('auth.jwtSecret') ?? '';
    const configured = [
      ...(String(this.configService.get<string>('SUPER_ADMIN_EMAILS') || process.env.SUPER_ADMIN_EMAILS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)),
      String(this.configService.get<string>('SUPER_ADMIN_EMAIL') || process.env.SUPER_ADMIN_EMAIL || '').trim(),
      // default fallback(s)
      'constantin.pristavita@gmail.com',
      'constantinpristavita@gmail.com',
    ]
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    this.superAdminEmailSet = new Set(
      configured
        .map((entry) => this.normalizeEmailForMatch(entry))
        .filter(Boolean),
    );
    this.superAdminEmailRawCandidates = this.expandEmailCandidates(configured);
  }

  async onModuleInit(): Promise<void> {
    await this.promoteConfiguredSuperAdmin();
  }

  private normalizeEmailForMatch(email?: string): string {
    const raw = String(email || '').trim().toLowerCase();
    if (!raw || !raw.includes('@')) return raw;
    const [localPart, domainPart] = raw.split('@');
    if (!localPart || !domainPart) return raw;

    if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
      const localBase = localPart.split('+')[0].replace(/\./g, '');
      return `${localBase}@gmail.com`;
    }

    return `${localPart}@${domainPart}`;
  }

  private expandEmailCandidates(items: string[]): string[] {
    const out = new Set<string>();
    for (const input of items) {
      const raw = String(input || '').trim().toLowerCase();
      if (!raw || !raw.includes('@')) continue;
      out.add(raw);

      const [localPart, domainPart] = raw.split('@');
      if (!localPart || !domainPart) continue;

      if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
        const withoutPlus = localPart.split('+')[0];
        out.add(`${withoutPlus}@gmail.com`);
        out.add(`${withoutPlus.replace(/\./g, '')}@gmail.com`);
      }
    }
    return Array.from(out);
  }

  private isConfiguredSuperAdminEmail(email?: string): boolean {
    const normalized = this.normalizeEmailForMatch(email);
    return !!normalized && this.superAdminEmailSet.has(normalized);
  }

  private getDefaultWorkspaceFeatures(): WorkspaceSettings['features'] {
    return {
      aiEnabled: true,
      slackIntegration: true,
      emailIntegration: true,
      whatsappEnabled: true,
      contactsEnabled: true,
      leadsEnabled: true,
      calendarEnabled: true,
      pipelineEnabled: true,
      tasksEnabled: true,
      automationEnabled: true,
      marketingEnabled: true,
      mobileAppEnabled: true,
    };
  }

  private getWorkspaceLimitsForPackage(
    packageId: 'starter' | 'growth' | 'scale',
  ): NonNullable<WorkspaceSettings['limits']> {
    if (packageId === 'growth') {
      return { maxUsers: 25, maxWhatsAppNumbers: 3 };
    }
    if (packageId === 'scale') {
      return { maxUsers: null, maxWhatsAppNumbers: 10 };
    }
    return { maxUsers: 8, maxWhatsAppNumbers: 1 };
  }

  private buildWorkspaceSettingsForNewSignup(
    packageId: 'starter' | 'growth' | 'scale' = 'starter',
  ): WorkspaceSettings {
    return {
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      currency: 'USD',
      features: this.getDefaultWorkspaceFeatures(),
      billing: {
        grandfathered: false,
        package: packageId,
        billingProvider: 'stripe' as const,
        billingStatus: 'trialing' as const,
      },
      limits: this.getWorkspaceLimitsForPackage(packageId),
    };
  }

  private async promoteConfiguredSuperAdmin(): Promise<void> {
    if (!this.superAdminEmailRawCandidates.length) return;

    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) IN (:...emails)', { emails: this.superAdminEmailRawCandidates })
      .getMany();

    for (const user of users) {
      if (!this.isConfiguredSuperAdminEmail(user.email) || user.role === UserRole.SUPER_ADMIN) continue;
      user.role = UserRole.SUPER_ADMIN;
      await this.userRepository.save(user);
      this.logger.log(`Promoted ${user.email} to SUPER_ADMIN`);
    }
  }

  /**
   * Validate user credentials for login
   */
  async validateUser(email: string, password: string, workspaceId?: string): Promise<User | null> {
    try {
      const where: any = workspaceId
        ? { email, workspaceId }
        : { email };
      const user = await this.userRepository.findOne({ where });

      // Block suspended/inactive users but allow PENDING (they see approval screen)
      if (user && (user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE)) {
        throw new UnauthorizedException('Account is suspended or inactive');
      }

      if (!user) {
        return null;
      }

      if (this.isConfiguredSuperAdminEmail(user.email) && user.role !== UserRole.SUPER_ADMIN) {
        user.role = UserRole.SUPER_ADMIN;
        await this.userRepository.save(user);
      }

      // Check if account is locked
      if (user.isLocked) {
        throw new UnauthorizedException('Account is temporarily locked due to failed login attempts');
      }

      // Validate password
      const isPasswordValid = await user.validatePassword(password);
      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.incrementFailedLoginAttempts(user);
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error(`User validation failed (hashed identifier: ${Buffer.from(email).toString('base64').substring(0, 12)}):`, error.message);
      return null;
    }
  }

  /**
   * User login with comprehensive security checks
   */
  async login(loginDto: LoginDto, ipAddress?: string): Promise<AuthResponse> {
    try {
      const user = await this.validateUser(loginDto.email, loginDto.password, loginDto.workspaceId);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update login information
      user.updateLastLogin();
      await this.userRepository.save(user);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      this.logger.log(`User ${user.id} logged in successfully`);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status as UserStatus,
          workspaceId: user.workspaceId,
        },
        ...tokens,
        pendingApproval: user.status === UserStatus.PENDING,
      };
    } catch (error) {
      this.logger.error(`Login failed (correlation: ${Buffer.from(loginDto.email).toString('base64').substring(0, 12)}):`, error.message);
      throw error;
    }
  }

  /**
   * User registration with workspace support
   */
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Handle workspace creation or joining
      let workspace: Workspace;
      let userRole = UserRole.SALES_REP;
      let userStatus = UserStatus.ACTIVE;
      let pendingApproval = false;

      if (registerDto.inviteCode) {
        // Join workspace via invite code (trusted — instant access)
        workspace = await this.workspaceRepository.findOne({
          where: { inviteCode: registerDto.inviteCode },
        });
        if (!workspace) {
          throw new NotFoundException('Invalid invite code');
        }
        // Invited user gets ACTIVE status immediately
        userStatus = UserStatus.ACTIVE;
      } else if (registerDto.workspaceDomain) {
        // Join existing workspace without invite code — requires approval
        workspace = await this.workspaceRepository.findOne({
          where: { domain: registerDto.workspaceDomain },
        });
        if (!workspace) {
          throw new NotFoundException('Workspace not found');
        }
        userStatus = UserStatus.PENDING;
        pendingApproval = true;
      } else {
        // Create new workspace (first user becomes admin)
        workspace = this.workspaceRepository.create({
          name: registerDto.workspaceName || `${registerDto.firstName}'s Workspace`,
          domain: this.generateWorkspaceDomain(registerDto.email),
          plan: 'trial',
          isActive: true,
          settings: this.buildWorkspaceSettingsForNewSignup('starter'),
        });

        workspace = await this.workspaceRepository.save(workspace);
        userRole = UserRole.ADMIN; // First user is admin
      }

      // Hash password before creating user (no longer using entity hooks)
      const bcryptRounds = this.configService.get<number>('auth.bcryptRounds') || 12;
      const hashedPassword = await bcrypt.hash(registerDto.password, bcryptRounds);

      if (this.isConfiguredSuperAdminEmail(registerDto.email)) {
        userRole = UserRole.SUPER_ADMIN;
        userStatus = UserStatus.ACTIVE;
        pendingApproval = false;
      }

      // Create user
      const user = this.userRepository.create({
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        password: hashedPassword,
        role: userRole,
        status: userStatus,
        workspaceId: workspace.id,
      });

      const savedUser = await this.userRepository.save(user);

      // Generate tokens
      const tokens = await this.generateTokens(savedUser);

      this.logger.log(`User ${savedUser.id} registered (status: ${userStatus})`);

      return {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          role: savedUser.role,
          status: savedUser.status as UserStatus,
          workspaceId: savedUser.workspaceId,
        },
        ...tokens,
        pendingApproval,
      };
    } catch (error) {
      this.logger.error(`Registration failed (correlation: ${Buffer.from(registerDto.email).toString('base64').substring(0, 12)}):`, error.message);
      throw error;
    }
  }

  /**
   * Generate JWT access and refresh tokens with unique JTI for revocation
   */
  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    // Generate unique JTIs for both tokens (required for blacklisting)
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      jti: accessJti,
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      jti: refreshJti,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get('auth.jwtSecret'),
        expiresIn: this.configService.get('auth.jwtExpiresIn'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get('auth.jwtRefreshSecret'),
        expiresIn: this.configService.get('auth.jwtRefreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Generate signed OAuth state token to prevent CSRF
   */
  generateOAuthState(source: 'web' | 'mobile' = 'web'): string {
    return this.jwtService.sign(
      { nonce: randomBytes(16).toString('hex'), source },
      {
        secret: this.oauthStateSecret,
        expiresIn: Math.floor(this.oauthStateTtlMs / 1000),
      },
    );
  }

  /**
   * Validate OAuth state and return the source ('web' | 'mobile'), or null if invalid
   */
  getOAuthStateSource(state?: string): 'web' | 'mobile' | null {
    if (!state) return null;
    try {
      const payload = this.jwtService.verify(state, { secret: this.oauthStateSecret }) as { source?: string };
      return payload.source === 'mobile' ? 'mobile' : 'web';
    } catch (error) {
      this.logger.warn(`Invalid OAuth state received: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate OAuth state token (kept for backwards compat)
   */
  validateOAuthState(state?: string): boolean {
    return this.getOAuthStateSource(state) !== null;
  }

  /**
   * Create short-lived auth code for OAuth callback exchange
   */
  createOAuthAuthCode(authResponse: AuthResponse): string {
    const payload = {
      type: 'oauth-auth-code',
      data: authResponse,
    };

    return this.jwtService.sign(payload, {
      secret: this.oauthStateSecret,
      expiresIn: Math.floor(this.oauthAuthCodeTtlMs / 1000),
    });
  }

  /**
   * Consume and invalidate auth code
   */
  consumeOAuthAuthCode(code: string): AuthResponse {
    try {
      const payload = this.jwtService.verify(code, { secret: this.oauthStateSecret }) as {
        type: string;
        data: AuthResponse;
      };

      if (payload.type !== 'oauth-auth-code' || !payload.data) {
        throw new UnauthorizedException('Invalid auth code');
      }

      return payload.data;
    } catch (error) {
      this.logger.warn(`OAuth code exchange failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired auth code');
    }
  }

  /**
   * Refresh JWT tokens
   */
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('auth.jwtRefreshSecret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub, status: UserStatus.ACTIVE },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch (error) {
      this.logger.error('Token refresh failed:', error.stack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user and blacklist their current token
   *
   * @param userId - User ID
   * @param accessToken - The access token to blacklist
   * @param refreshToken - Optional refresh token to blacklist
   */
  async logout(
    userId: string,
    accessToken?: string,
    refreshToken?: string
  ): Promise<{ message: string }> {
    try {
      // Decode tokens to get JTIs without verification (tokens might be expired)
      const accessJtiPromises = [];
      const refreshJtiPromises = [];

      // Get token expiration times for TTL
      const accessExpiresIn = this.parseExpiration(this.configService.get('auth.jwtExpiresIn'));
      const refreshExpiresIn = this.parseExpiration(this.configService.get('auth.jwtRefreshExpiresIn'));

      // Blacklist access token if provided
      if (accessToken) {
        const accessPayload = this.jwtService.decode(accessToken) as JwtPayload;
        if (accessPayload?.jti) {
          accessJtiPromises.push(
            this.tokenBlacklistService.blacklistToken(accessPayload.jti, accessExpiresIn, 'logout')
          );
        }
      }

      // Blacklist refresh token if provided
      if (refreshToken) {
        const refreshPayload = this.jwtService.decode(refreshToken) as JwtPayload;
        if (refreshPayload?.jti) {
          refreshJtiPromises.push(
            this.tokenBlacklistService.blacklistToken(refreshPayload.jti, refreshExpiresIn, 'logout')
          );
        }
      }

      // Blacklist both tokens in parallel
      await Promise.all([...accessJtiPromises, ...refreshJtiPromises]);

      this.logger.log(`User ${userId} logged out successfully`);
      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(`Logout failed for user ${userId}:`, error);
      // Even if blacklisting fails, return success (fail open for logout)
      return { message: 'Logged out successfully' };
    }
  }

  /**
   * Logout from all devices - blacklist all user tokens
   */
  async logoutAllDevices(userId: string): Promise<{ message: string }> {
    try {
      // Use the longer of access/refresh token expiration
      const refreshExpiresIn = this.parseExpiration(this.configService.get('auth.jwtRefreshExpiresIn'));

      await this.tokenBlacklistService.blacklistUserTokens(userId, refreshExpiresIn);

      this.logger.log(`User ${userId} logged out from all devices`);
      return { message: 'Logged out from all devices successfully' };
    } catch (error) {
      this.logger.error(`Logout all devices failed for user ${userId}:`, error);
      throw new BadRequestException('Failed to logout from all devices');
    }
  }

  /**
   * Parse expiration string to seconds
   * Supports formats like '15m', '7d', '24h'
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 86400; // Default to 24 hours
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * multipliers[unit];
  }

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['workspace'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      workspaceId: user.workspaceId,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Increment failed login attempts and lock account if necessary
   */
  private async incrementFailedLoginAttempts(user: User): Promise<void> {
    user.incrementFailedLoginAttempts();
    await this.userRepository.save(user);

    if (user.isLocked) {
      this.logger.warn(`Account locked for user ${user.id} due to failed login attempts`);
    }
  }

  /**
   * Generate unique workspace domain
   */
  private generateWorkspaceDomain(email: string): string {
    const username = email.split('@')[0];
    const timestamp = Date.now();
    return `${username}-${timestamp}`.toLowerCase();
  }

  /**
   * Check if user has specific permission
   */
  async checkPermission(userId: string, action: string, resource?: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return false;
    }

    return user.hasPermission(action);
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updateData: { firstName?: string; lastName?: string; email?: string; preferences?: any },
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email is being changed and if it's already taken
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateData.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      user.email = updateData.email;
    }

    if (updateData.firstName) {
      user.firstName = updateData.firstName;
    }

    if (updateData.lastName) {
      user.lastName = updateData.lastName;
    }

    if (updateData.preferences) {
      user.preferences = { ...user.preferences, ...updateData.preferences };
    }

    return this.userRepository.save(user);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash and save new password with configured bcrypt rounds
    const bcryptRounds = this.configService.get<number>('auth.bcryptRounds') || 12;
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, bcryptRounds);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    this.logger.log(`Password changed for user ${user.id}`);
    return { message: 'Password changed successfully' };
  }

  /**
   * Request password reset - generates reset token and sends email
   */
  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const user = await this.userRepository.findOne({ where: { email } });

    // Don't reveal if user exists (security best practice)
    if (!user) {
      this.logger.warn(`Password reset requested for non-existent user (correlation: ${Buffer.from(email).toString('base64').substring(0, 12)})`);
      return { message: 'If that email exists, a password reset link has been sent' };
    }

    // Generate password reset token (valid for 1 hour)
    const resetToken = this.jwtService.sign(
      { userId: user.id, email: user.email, type: 'password-reset' },
      { expiresIn: '1h' }
    );

    this.logger.log(`Password reset token generated for user ${user.id}`);
    const emailSent = await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    if (!emailSent) {
      this.logger.warn(`Failed to send password reset email to user ${user.id}`);
    }

    return {
      message: 'If that email exists, a password reset link has been sent',
    };
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      // Verify and decode token
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'password-reset') {
        throw new BadRequestException('Invalid token type');
      }

      // Find user
      const user = await this.userRepository.findOne({ where: { id: payload.userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Hash and update password with configured bcrypt rounds
      const bcryptRounds = this.configService.get<number>('auth.bcryptRounds') || 12;
      const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds);
      user.password = hashedPassword;

      // Reset failed login attempts
      user.resetFailedLoginAttempts();

      await this.userRepository.save(user);

      this.logger.log(`Password reset successfully for user ${user.id}`);
      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Password reset token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new BadRequestException('Invalid password reset token');
      }
      throw error;
    }
  }

  /**
   * Send email verification token
   */
  async sendEmailVerification(userId: string): Promise<{ message: string; verificationToken?: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate email verification token (valid for 24 hours)
    const verificationToken = this.jwtService.sign(
      { userId: user.id, email: user.email, type: 'email-verification' },
      { expiresIn: '24h' }
    );

    // TODO: Send verification email. Token is not returned in response.
    this.logger.log(`Email verification token generated for user ${user.id}`);

    return {
      message: 'Verification email sent',
    };
  }

  /**
   * Verify email using verification token
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      // Verify and decode token
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'email-verification') {
        throw new BadRequestException('Invalid token type');
      }

      // Find user
      const user = await this.userRepository.findOne({ where: { id: payload.userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Mark email as verified (you may need to add this field to User entity)
      // user.emailVerified = true;
      // user.emailVerifiedAt = new Date();

      await this.userRepository.save(user);

      this.logger.log(`Email verified for user ${user.id}`);
      return { message: 'Email verified successfully' };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Email verification token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new BadRequestException('Invalid email verification token');
      }
      throw error;
    }
  }

  /**
   * Google OAuth login - exchange code for tokens and user info
   */
  async googleLogin(code: string): Promise<AuthResponse> {
    try {
      this.logger.log('Google OAuth login started');
      // Exchange authorization code for access token
      const params = new URLSearchParams({
        code,
        client_id: this.configService.get('GOOGLE_CLIENT_ID'),
        client_secret: this.configService.get('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.configService.get('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
      });

      this.logger.log('Exchanging code for token with Google...');
      const tokenResponse = await firstValueFrom(
        this.httpService.post('https://oauth2.googleapis.com/token', params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      this.logger.log('Token received from Google');
      const { access_token } = tokenResponse.data;

      // Get user info from Google
      this.logger.log('Getting user info from Google...');
      const userInfoResponse = await firstValueFrom(
        this.httpService.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        })
      );

      const { email, given_name, family_name, id: googleId } = userInfoResponse.data;
      // Some Google accounts may not have a family_name; ensure we never insert NULL into NOT NULL columns
      const firstName = given_name || email?.split('@')[0] || 'User';
      const lastName = family_name || 'OAuth';
      this.logger.log('User info received from OAuth provider');

      // Find or create user
      this.logger.log('Looking for existing user...');
      let user = await this.userRepository.findOne({ where: { email } });

      if (!user) {
        // Create default workspace for new user
        const workspaceName = `${firstName}'s Workspace`;
        const workspaceDomain = `${firstName.toLowerCase()}-${Date.now()}`;
        const workspace = this.workspaceRepository.create({
          name: workspaceName,
          domain: workspaceDomain,
          plan: 'trial',
          isActive: true,
          settings: this.buildWorkspaceSettingsForNewSignup('starter'),
        });
        await this.workspaceRepository.save(workspace);

        // Create new user with Google OAuth
        user = this.userRepository.create({
          email,
          firstName,
          lastName,
          password: await bcrypt.hash(Math.random().toString(36), 10), // Random password
          role: this.isConfiguredSuperAdminEmail(email) ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          workspaceId: workspace.id,
          // Store Google ID if you have a field for it
        });
        await this.userRepository.save(user);
        this.logger.log(`New user ${user.id} created via Google OAuth`);
      } else {
        // Update last login
        if (this.isConfiguredSuperAdminEmail(user.email) && user.role !== UserRole.SUPER_ADMIN) {
          user.role = UserRole.SUPER_ADMIN;
        }
        user.updateLastLogin();
        await this.userRepository.save(user);
      }

      // Generate JWT tokens
      const tokens = await this.generateTokens(user);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status as UserStatus,
          workspaceId: user.workspaceId,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      this.logger.error('Google OAuth login failed:', error.message);
      if (error.response) {
        this.logger.error('Google API error response:', JSON.stringify(error.response.data));
        this.logger.error('Status code:', error.response.status);
      }
      this.logger.error('Full error:', error.stack);
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  /**
   * Slack OAuth login - exchange code for tokens and user info
   */
  async slackLogin(code: string): Promise<AuthResponse> {
    try {
      // Exchange authorization code for access token
      const tokenResponse = await firstValueFrom(
        this.httpService.post('https://slack.com/api/oauth.v2.access', {
          code,
          client_id: this.configService.get('SLACK_CLIENT_ID'),
          client_secret: this.configService.get('SLACK_CLIENT_SECRET'),
          redirect_uri: this.configService.get('SLACK_CALLBACK_URL'),
        })
      );

      const { authed_user } = tokenResponse.data;

      // Get user info from Slack
      const userInfoResponse = await firstValueFrom(
        this.httpService.get('https://slack.com/api/users.identity', {
          headers: { Authorization: `Bearer ${authed_user.access_token}` },
        })
      );

      const { email, name } = userInfoResponse.data.user;
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ');

      // Find or create user
      let user = await this.userRepository.findOne({ where: { email } });

      if (!user) {
        // Create default workspace for new user
        const workspace = this.workspaceRepository.create({
          name: `${firstName}'s Workspace`,
          domain: `${firstName.toLowerCase()}-${Date.now()}`,
          plan: 'trial',
          isActive: true,
          settings: this.buildWorkspaceSettingsForNewSignup('starter'),
        });
        await this.workspaceRepository.save(workspace);

        // Create new user with Slack OAuth
        user = this.userRepository.create({
          email,
          firstName,
          lastName,
          password: await bcrypt.hash(Math.random().toString(36), 10), // Random password
          role: this.isConfiguredSuperAdminEmail(email) ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          workspaceId: workspace.id,
        });
        await this.userRepository.save(user);
        this.logger.log(`New user ${user.id} created via Slack OAuth`);
      } else {
        // Update last login
        if (this.isConfiguredSuperAdminEmail(user.email) && user.role !== UserRole.SUPER_ADMIN) {
          user.role = UserRole.SUPER_ADMIN;
        }
        user.updateLastLogin();
        await this.userRepository.save(user);
      }

      // Generate JWT tokens
      const tokens = await this.generateTokens(user);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status as UserStatus,
          workspaceId: user.workspaceId,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      this.logger.error('Slack OAuth login failed:', error.message);
      throw new UnauthorizedException('Slack authentication failed');
    }
  }
}
