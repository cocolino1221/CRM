import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRoleDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { plainToClass } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a new user in the workspace
   */
  async create(
    createUserDto: CreateUserDto,
    workspaceId: string,
    creatorRole: UserRole,
  ): Promise<UserResponseDto> {
    // Check if creator has permission (only ADMIN and MANAGER can create users)
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(creatorRole)) {
      throw new ForbiddenException('You do not have permission to create users');
    }

    // Check if email already exists in workspace
    const existingUser = await this.userRepository.findOne({
      where: {
        email: createUserDto.email,
        workspaceId,
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists in workspace');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      workspaceId,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await this.userRepository.save(user);

    return this.transformToResponse(savedUser);
  }

  /**
   * Find all users in workspace
   */
  async findAll(
    workspaceId: string,
    options?: {
      role?: UserRole;
      status?: UserStatus;
      search?: string;
    },
  ): Promise<UserResponseDto[]> {
    const query = this.userRepository.createQueryBuilder('user')
      .where('user.workspaceId = :workspaceId', { workspaceId })
      .andWhere('user.deletedAt IS NULL');

    if (options?.role) {
      query.andWhere('user.role = :role', { role: options.role });
    }

    if (options?.status) {
      query.andWhere('user.status = :status', { status: options.status });
    }

    if (options?.search) {
      query.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    query.orderBy('user.createdAt', 'DESC');

    const users = await query.getMany();
    return users.map(user => this.transformToResponse(user));
  }

  /**
   * Find one user by ID
   */
  async findOne(id: string, workspaceId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, workspaceId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.transformToResponse(user);
  }

  /**
   * Update user profile
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    workspaceId: string,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id, workspaceId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, updateUserDto);
    const updatedUser = await this.userRepository.save(user);

    return this.transformToResponse(updatedUser);
  }

  /**
   * Update user role (Admin only)
   */
  async updateRole(
    id: string,
    updateRoleDto: UpdateUserRoleDto,
    workspaceId: string,
    currentUserRole: UserRole,
  ): Promise<UserResponseDto> {
    // Only ADMIN can change roles
    if (currentUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can change user roles');
    }

    const user = await this.userRepository.findOne({
      where: { id, workspaceId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.role = updateRoleDto.role;
    const updatedUser = await this.userRepository.save(user);

    return this.transformToResponse(updatedUser);
  }

  /**
   * Update user status
   */
  async updateStatus(
    id: string,
    updateStatusDto: UpdateUserStatusDto,
    workspaceId: string,
    currentUserRole: UserRole,
  ): Promise<UserResponseDto> {
    // Only ADMIN and MANAGER can change status
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(currentUserRole)) {
      throw new ForbiddenException('You do not have permission to change user status');
    }

    const user = await this.userRepository.findOne({
      where: { id, workspaceId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = updateStatusDto.status;
    const updatedUser = await this.userRepository.save(user);

    return this.transformToResponse(updatedUser);
  }

  /**
   * Soft delete user (remove from workspace)
   */
  async remove(
    id: string,
    workspaceId: string,
    currentUserRole: UserRole,
  ): Promise<void> {
    // Only ADMIN can delete users
    if (currentUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can remove users');
    }

    const user = await this.userRepository.findOne({
      where: { id, workspaceId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.softRemove(user);
  }

  /**
   * Send invitation email to new user
   */
  async inviteUser(
    inviteDto: InviteUserDto,
    workspaceId: string,
    inviterName: string,
  ): Promise<{ message: string; invitationId: string }> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: {
        email: inviteDto.email,
        workspaceId,
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this workspace');
    }

    // Generate invitation token (in production, store this in database with expiry)
    const invitationToken = Buffer.from(
      `${workspaceId}:${inviteDto.email}:${Date.now()}`,
    ).toString('base64');

    const inviteUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitationToken}`;

    // Send invitation email
    await this.emailService.sendInviteEmail(
      inviteDto.email,
      inviterName,
      inviteUrl,
      inviteDto.customMessage,
    );

    return {
      message: `Invitation sent to ${inviteDto.email}`,
      invitationId: invitationToken,
    };
  }

  /**
   * Get user statistics
   */
  async getStatistics(workspaceId: string): Promise<{
    total: number;
    byRole: Record<UserRole, number>;
    byStatus: Record<UserStatus, number>;
    recentlyAdded: number;
  }> {
    const users = await this.userRepository.find({
      where: { workspaceId },
    });

    const total = users.length;

    const byRole = {} as Record<UserRole, number>;
    Object.values(UserRole).forEach(role => {
      byRole[role] = users.filter(u => u.role === role).length;
    });

    const byStatus = {} as Record<UserStatus, number>;
    Object.values(UserStatus).forEach(status => {
      byStatus[status] = users.filter(u => u.status === status).length;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyAdded = users.filter(u => u.createdAt >= sevenDaysAgo).length;

    return {
      total,
      byRole,
      byStatus,
      recentlyAdded,
    };
  }

  /**
   * Transform user entity to response DTO (exclude sensitive data)
   */
  private transformToResponse(user: User): UserResponseDto {
    const response = plainToClass(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
    response.fullName = user.fullName;
    return response;
  }
}
