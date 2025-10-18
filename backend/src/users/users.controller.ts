import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRoleDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole, UserStatus } from '../database/entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user in workspace' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @Req() req: any,
  ): Promise<UserResponseDto> {
    return this.usersService.create(
      createUserDto,
      req.user.workspaceId,
      req.user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all users in workspace' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: [UserResponseDto],
  })
  async findAll(
    @Req() req: any,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
  ): Promise<UserResponseDto[]> {
    return this.usersService.findAll(req.user.workspaceId, {
      role,
      status,
      search,
    });
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get user statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Req() req: any) {
    return this.usersService.getStatistics(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id, req.user.workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, updateUserDto, req.user.workspaceId);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateUserRoleDto,
    @Req() req: any,
  ): Promise<UserResponseDto> {
    return this.usersService.updateRole(
      id,
      updateRoleDto,
      req.user.workspaceId,
      req.user.role,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update user status' })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
    @Req() req: any,
  ): Promise<UserResponseDto> {
    return this.usersService.updateStatus(
      id,
      updateStatusDto,
      req.user.workspaceId,
      req.user.role,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user from workspace (Admin only)' })
  @ApiResponse({ status: 204, description: 'User removed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id') id: string, @Req() req: any): Promise<void> {
    return this.usersService.remove(id, req.user.workspaceId, req.user.role);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Send invitation to new user' })
  @ApiResponse({
    status: 201,
    description: 'Invitation sent successfully',
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async invite(@Body() inviteDto: InviteUserDto, @Req() req: any) {
    return this.usersService.inviteUser(
      inviteDto,
      req.user.workspaceId,
      req.user.fullName || `${req.user.firstName} ${req.user.lastName}`,
    );
  }
}
