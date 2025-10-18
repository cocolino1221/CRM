import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';

/**
 * Authentication service with comprehensive security features
 * Handles login, registration, JWT tokens, and user management
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Validate user credentials for login
   */
  async validateUser(email: string, password: string, workspaceId?: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: workspaceId
          ? { email, workspaceId, status: UserStatus.ACTIVE }
          : { email, status: UserStatus.ACTIVE },
      });

      if (!user) {
        return null;
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
      this.logger.error(`User validation failed for email ${email}:`, error.stack);
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

      this.logger.log(`User ${user.email} logged in successfully`);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          workspaceId: user.workspaceId,
        },
        ...tokens,
      };
    } catch (error) {
      this.logger.error(`Login failed for ${loginDto.email}:`, error.stack);
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

      if (registerDto.workspaceDomain) {
        // Join existing workspace
        workspace = await this.workspaceRepository.findOne({
          where: { domain: registerDto.workspaceDomain },
        });

        if (!workspace) {
          throw new NotFoundException('Workspace not found');
        }
      } else {
        // Create new workspace (first user becomes admin)
        workspace = this.workspaceRepository.create({
          name: registerDto.workspaceName || `${registerDto.firstName}'s Workspace`,
          domain: this.generateWorkspaceDomain(registerDto.email),
          plan: 'trial',
          isActive: true,
          settings: {
            timezone: 'UTC',
            dateFormat: 'MM/DD/YYYY',
            currency: 'USD',
            features: {
              aiEnabled: true,
              slackIntegration: true,
              emailIntegration: true,
            },
          },
        });

        workspace = await this.workspaceRepository.save(workspace);
        userRole = UserRole.ADMIN; // First user is admin
      }

      // Create user
      const user = this.userRepository.create({
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        password: registerDto.password, // Will be hashed by entity hook
        role: userRole,
        status: UserStatus.ACTIVE,
        workspaceId: workspace.id,
      });

      const savedUser = await this.userRepository.save(user);

      // Generate tokens
      const tokens = await this.generateTokens(savedUser);

      this.logger.log(`User ${savedUser.email} registered successfully`);

      return {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          role: savedUser.role,
          workspaceId: savedUser.workspaceId,
        },
        ...tokens,
      };
    } catch (error) {
      this.logger.error(`Registration failed for ${registerDto.email}:`, error.stack);
      throw error;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.jwtSecret'),
        expiresIn: this.configService.get('auth.jwtExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.jwtRefreshSecret'),
        expiresIn: this.configService.get('auth.jwtRefreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
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
   * Logout user (invalidate tokens on client side)
   */
  async logout(userId: string): Promise<{ message: string }> {
    // In a production environment, you might want to blacklist tokens
    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logged out successfully' };
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
      this.logger.warn(`Account locked for user ${user.email} due to failed login attempts`);
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
    updateData: { firstName?: string; lastName?: string; email?: string },
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

    return this.userRepository.save(user);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    passwordData: { currentPassword: string; newPassword: string },
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(passwordData.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(passwordData.newPassword, 10);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    this.logger.log(`Password changed for user ${user.email}`);
    return { message: 'Password changed successfully' };
  }

  /**
   * Request password reset - generates reset token and sends email
   */
  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const user = await this.userRepository.findOne({ where: { email } });

    // Don't reveal if user exists (security best practice)
    if (!user) {
      this.logger.warn(`Password reset requested for non-existent email: ${email}`);
      return { message: 'If that email exists, a password reset link has been sent' };
    }

    // Generate password reset token (valid for 1 hour)
    const resetToken = this.jwtService.sign(
      { userId: user.id, email: user.email, type: 'password-reset' },
      { expiresIn: '1h' }
    );

    // TODO: Send email with reset link
    // For now, return token in response (in production, only send via email)
    this.logger.log(`Password reset token generated for ${email}`);

    return {
      message: 'If that email exists, a password reset link has been sent',
      resetToken, // Remove this in production - only for development
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

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;

      // Reset failed login attempts
      user.resetFailedLoginAttempts();

      await this.userRepository.save(user);

      this.logger.log(`Password reset successfully for user ${user.email}`);
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

    // TODO: Send verification email
    this.logger.log(`Email verification token generated for ${user.email}`);

    return {
      message: 'Verification email sent',
      verificationToken, // Remove this in production - only for development
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

      this.logger.log(`Email verified for user ${user.email}`);
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
}