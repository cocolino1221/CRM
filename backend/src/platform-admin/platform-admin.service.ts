import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Workspace } from '../database/entities/workspace.entity';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Activity } from '../database/entities/activity.entity';
import { Notification } from '../database/entities/notification.entity';
import { IntegrationLog } from '../database/entities/integration.entity';
import { CreatePlatformWorkspaceDto } from './dto/create-platform-workspace.dto';

type WorkspacePlan = 'trial' | 'starter' | 'professional' | 'enterprise';

type WorkspaceFeatureFlags = {
  aiEnabled: boolean;
  slackIntegration: boolean;
  emailIntegration: boolean;
  whatsappEnabled: boolean;
  contactsEnabled: boolean;
  leadsEnabled: boolean;
  calendarEnabled: boolean;
  pipelineEnabled: boolean;
  tasksEnabled: boolean;
  automationEnabled: boolean;
  marketingEnabled: boolean;
  mobileAppEnabled: boolean;
};

type PlatformLogSource = 'activity' | 'notification' | 'integration';
type PlatformLogLevel = 'info' | 'warn' | 'error';

type PlatformLogEntry = {
  id: string;
  source: PlatformLogSource;
  level: PlatformLogLevel;
  category: string;
  message: string;
  createdAt: Date;
  workspaceId: string;
  workspaceName?: string;
  actor?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
};

@Injectable()
export class PlatformAdminService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(IntegrationLog)
    private readonly integrationLogRepository: Repository<IntegrationLog>,
    private readonly configService: ConfigService,
  ) {}

  private getDefaultFeatures(): WorkspaceFeatureFlags {
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

  private sanitizeFeatures(raw: any): WorkspaceFeatureFlags {
    const defaults = this.getDefaultFeatures();
    const input = raw && typeof raw === 'object' ? raw : {};
    const next = { ...defaults } as WorkspaceFeatureFlags;

    (Object.keys(defaults) as Array<keyof WorkspaceFeatureFlags>).forEach((key) => {
      if (typeof input[key] === 'boolean') {
        next[key] = input[key];
      }
    });

    return next;
  }

  private getDefaultWorkspaceSettings() {
    return {
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      currency: 'USD',
      features: this.getDefaultFeatures(),
    };
  }

  private sanitizeDomainCandidate(raw: string): string {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private async resolveWorkspaceDomain(
    proposedDomain: string | undefined,
    workspaceName: string,
    workspaceRepo: Repository<Workspace> = this.workspaceRepository,
  ): Promise<string> {
    if (proposedDomain && proposedDomain.trim()) {
      const sanitized = this.sanitizeDomainCandidate(proposedDomain);
      if (!sanitized) {
        throw new BadRequestException('Invalid workspace domain');
      }

      const exists = await workspaceRepo.exists({ where: { domain: sanitized } });
      if (exists) {
        throw new ConflictException('Workspace domain already exists');
      }

      return sanitized;
    }

    const base = this.sanitizeDomainCandidate(workspaceName) || 'workspace';
    let candidate = base;
    let suffix = 1;

    while (await workspaceRepo.exists({ where: { domain: candidate } })) {
      suffix += 1;
      const suffixLabel = `${suffix}`;
      const maxBaseLength = Math.max(2, 80 - suffixLabel.length - 1);
      candidate = `${base.slice(0, maxBaseLength)}-${suffixLabel}`;
    }

    return candidate;
  }

  private extractWorkspaceFeatures(workspace: Workspace): WorkspaceFeatureFlags {
    const settings = workspace?.settings && typeof workspace.settings === 'object' ? workspace.settings : {};
    const features = (settings as any).features;
    return this.sanitizeFeatures(features);
  }

  async createWorkspace(payload: CreatePlatformWorkspaceDto) {
    return this.workspaceRepository.manager.transaction(async (manager) => {
      const workspaceRepo = manager.getRepository(Workspace);
      const userRepo = manager.getRepository(User);

      const normalizedAdminEmail = payload.adminEmail.trim().toLowerCase();
      const existingUser = await userRepo.findOne({
        where: { email: normalizedAdminEmail },
      });
      if (existingUser) {
        throw new ConflictException('A user with this admin email already exists');
      }

      const domain = await this.resolveWorkspaceDomain(payload.domain, payload.name, workspaceRepo);

      const workspace = workspaceRepo.create({
        name: payload.name.trim(),
        domain,
        plan: (payload.plan || 'trial') as WorkspacePlan,
        isActive: payload.isActive ?? true,
        settings: this.getDefaultWorkspaceSettings(),
      });
      const savedWorkspace = await workspaceRepo.save(workspace);

      const bcryptRounds = this.configService.get<number>('auth.bcryptRounds') || 12;
      const hashedPassword = await bcrypt.hash(payload.adminPassword, bcryptRounds);

      const adminUser = userRepo.create({
        email: normalizedAdminEmail,
        firstName: payload.adminFirstName.trim(),
        lastName: payload.adminLastName.trim(),
        password: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        workspaceId: savedWorkspace.id,
      });
      const savedAdminUser = await userRepo.save(adminUser);

      return {
        message: 'Workspace created successfully',
        workspace: {
          id: savedWorkspace.id,
          name: savedWorkspace.name,
          domain: savedWorkspace.domain,
          plan: savedWorkspace.plan,
          isActive: savedWorkspace.isActive,
          inviteCode: savedWorkspace.inviteCode,
          createdAt: savedWorkspace.createdAt,
          features: this.extractWorkspaceFeatures(savedWorkspace),
        },
        adminUser: {
          id: savedAdminUser.id,
          email: savedAdminUser.email,
          firstName: savedAdminUser.firstName,
          lastName: savedAdminUser.lastName,
          role: savedAdminUser.role,
          status: savedAdminUser.status,
        },
      };
    });
  }

  async getOverview() {
    const workspaces = await this.workspaceRepository.find({
      select: ['id', 'name', 'domain', 'plan', 'isActive', 'createdAt', 'settings'],
      order: { createdAt: 'DESC' },
    });

    if (workspaces.length === 0) {
      return {
        totals: { workspaces: 0, users: 0, contacts: 0 },
        companies: [],
      };
    }

    const workspaceIds = workspaces.map((workspace) => workspace.id);
    const users = await this.userRepository.find({
      where: { workspaceId: In(workspaceIds) },
      select: ['id', 'workspaceId', 'firstName', 'lastName', 'email', 'role', 'status'],
      order: { firstName: 'ASC', lastName: 'ASC' },
    });

    const contactCountsRaw = await this.contactRepository
      .createQueryBuilder('contact')
      .select('contact.workspaceId', 'workspaceId')
      .addSelect('COUNT(contact.id)', 'count')
      .where('contact.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .andWhere('contact.deletedAt IS NULL')
      .groupBy('contact.workspaceId')
      .getRawMany<{ workspaceId: string; count: string }>();

    const usersByWorkspace = new Map<string, Array<{ id: string; name: string; email: string; role: string; status: string }>>();
    for (const user of users) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      const bucket = usersByWorkspace.get(user.workspaceId) || [];
      bucket.push({ id: user.id, name: fullName, email: user.email, role: user.role, status: user.status });
      usersByWorkspace.set(user.workspaceId, bucket);
    }

    const contactCountByWorkspace = new Map<string, number>();
    for (const row of contactCountsRaw) {
      contactCountByWorkspace.set(row.workspaceId, Number(row.count || 0));
    }

    const companies = workspaces.map((workspace) => {
      const workspaceUsers = usersByWorkspace.get(workspace.id) || [];
      return {
        id: workspace.id,
        name: workspace.name,
        domain: workspace.domain,
        plan: workspace.plan,
        isActive: workspace.isActive,
        createdAt: workspace.createdAt,
        userCount: workspaceUsers.length,
        users: workspaceUsers,
        contactCount: contactCountByWorkspace.get(workspace.id) || 0,
        features: this.extractWorkspaceFeatures(workspace),
      };
    });

    return {
      totals: {
        workspaces: companies.length,
        users: users.length,
        contacts: companies.reduce((sum, company) => sum + company.contactCount, 0),
      },
      companies,
    };
  }

  async getWorkspaceDetail(workspaceId: string) {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const users = await this.userRepository.find({
      where: { workspaceId },
      select: ['id', 'firstName', 'lastName', 'email', 'role', 'status', 'lastLoginAt', 'createdAt'],
      order: { createdAt: 'ASC' },
    });

    const contactCount = await this.contactRepository.count({
      where: { workspaceId },
    });

    return {
      ...workspace,
      features: this.extractWorkspaceFeatures(workspace),
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
      contactCount,
    };
  }

  async updateWorkspaceFeatures(workspaceId: string, partial: Partial<WorkspaceFeatureFlags>) {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const current = this.extractWorkspaceFeatures(workspace);
    const next = this.sanitizeFeatures({
      ...current,
      ...(partial || {}),
    });

    const currentSettings = workspace.settings && typeof workspace.settings === 'object'
      ? workspace.settings
      : ({} as any);

    workspace.settings = {
      ...currentSettings,
      features: next,
    };

    await this.workspaceRepository.save(workspace);

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      features: next,
    };
  }

  async updateWorkspace(workspaceId: string, payload: { name?: string; plan?: string; isActive?: boolean }) {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (payload.name !== undefined) {
      workspace.name = payload.name.trim();
    }
    if (payload.plan !== undefined) {
      workspace.plan = payload.plan as WorkspacePlan;
    }
    if (payload.isActive !== undefined) {
      workspace.isActive = payload.isActive;
    }

    await this.workspaceRepository.save(workspace);

    return {
      id: workspace.id,
      name: workspace.name,
      domain: workspace.domain,
      plan: workspace.plan,
      isActive: workspace.isActive,
      updatedAt: workspace.updatedAt,
    };
  }

  async deleteWorkspace(workspaceId: string) {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Delete all workspace data in dependency order
    await this.workspaceRepository.manager.transaction(async (manager) => {
      // Delete notifications
      await manager.delete(Notification, { workspaceId });
      // Delete activities
      await manager.delete(Activity, { workspaceId });
      // Delete contacts (soft-delete aware — use hard delete)
      await manager.query('DELETE FROM contacts WHERE "workspaceId" = $1', [workspaceId]);
      // Delete users
      await manager.delete(User, { workspaceId });
      // Delete workspace
      await manager.delete(Workspace, { id: workspaceId });
    });

    return { message: 'Workspace deleted', workspaceId };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check not the only admin in the workspace
    const adminCount = await this.userRepository.count({
      where: { workspaceId: user.workspaceId, role: UserRole.ADMIN },
    });
    if (user.role === UserRole.ADMIN && adminCount <= 1) {
      throw new BadRequestException('Cannot delete the only admin of a workspace');
    }

    await this.userRepository.delete({ id: userId });

    return { message: 'User deleted', userId };
  }

  async getPlatformLogs(options?: { limit?: number; workspaceId?: string }) {
    const safeLimit = Math.min(Math.max(options?.limit || 200, 20), 500);
    const workspaceId = options?.workspaceId;

    if (workspaceId) {
      const workspaceExists = await this.workspaceRepository.exists({ where: { id: workspaceId } });
      if (!workspaceExists) {
        throw new NotFoundException('Workspace not found');
      }
    }

    const whereClause = workspaceId ? { workspaceId } : ({} as any);

    const [activities, notifications, integrationLogs] = await Promise.all([
      this.activityRepository.find({
        where: whereClause,
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: safeLimit,
      }),
      this.notificationRepository.find({
        where: whereClause,
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: safeLimit,
      }),
      this.integrationLogRepository.find({
        where: whereClause,
        relations: ['integration'],
        order: { createdAt: 'DESC' },
        take: safeLimit,
      }),
    ]);

    const workspaceIds = Array.from(new Set([
      ...activities.map((item) => item.workspaceId),
      ...notifications.map((item) => item.workspaceId),
      ...integrationLogs.map((item) => item.workspaceId),
    ])).filter(Boolean);

    const workspaces = workspaceIds.length
      ? await this.workspaceRepository.find({
          where: { id: In(workspaceIds) },
          select: ['id', 'name'],
        })
      : [];

    const workspaceNameMap = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

    const activityLogs: PlatformLogEntry[] = activities.map((activity) => {
      const actorName = activity.user
        ? `${activity.user.firstName} ${activity.user.lastName}`.trim()
        : undefined;
      const level: PlatformLogLevel =
        activity.outcome === 'failed' ? 'error'
          : activity.type === 'system_event' || activity.type === 'api_call' ? 'warn'
            : 'info';

      return {
        id: activity.id,
        source: 'activity',
        level,
        category: String(activity.type || 'activity'),
        message: activity.title || activity.description || 'Activity event',
        createdAt: activity.createdAt,
        workspaceId: activity.workspaceId,
        workspaceName: workspaceNameMap.get(activity.workspaceId),
        actor: actorName,
        referenceId: activity.contactId || activity.dealId || activity.taskId,
        metadata: activity.metadata,
      };
    });

    const notificationLogs: PlatformLogEntry[] = notifications.map((notification) => {
      const actorName = notification.user
        ? `${notification.user.firstName} ${notification.user.lastName}`.trim()
        : undefined;
      const content = `${notification.title || 'Notification'}${notification.message ? ` - ${notification.message}` : ''}`;
      const lowerContent = content.toLowerCase();
      const level: PlatformLogLevel =
        lowerContent.includes('error') || lowerContent.includes('failed')
          ? 'error'
          : notification.type === 'system'
            ? 'warn'
            : 'info';

      return {
        id: notification.id,
        source: 'notification',
        level,
        category: String(notification.type || 'notification'),
        message: content,
        createdAt: notification.createdAt,
        workspaceId: notification.workspaceId,
        workspaceName: workspaceNameMap.get(notification.workspaceId),
        actor: actorName,
        referenceId: notification.userId,
        metadata: notification.metadata,
      };
    });

    const integrationSystemLogs: PlatformLogEntry[] = integrationLogs.map((log) => {
      const level: PlatformLogLevel =
        log.level === 'error' ? 'error'
          : log.level === 'warn' ? 'warn'
            : 'info';

      return {
        id: log.id,
        source: 'integration',
        level,
        category: log.integration?.type || 'integration',
        message: log.integration?.name
          ? `${log.integration.name}: ${log.message}`
          : log.message,
        createdAt: log.createdAt,
        workspaceId: log.workspaceId,
        workspaceName: workspaceNameMap.get(log.workspaceId),
        actor: log.integration?.name,
        referenceId: log.integrationId,
        metadata: {
          action: log.action,
          duration: log.duration,
          ...(log.data || {}),
        },
      };
    });

    const mergedLogs = [...activityLogs, ...notificationLogs, ...integrationSystemLogs]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, safeLimit);

    const sources: Record<PlatformLogSource, number> = {
      activity: 0,
      notification: 0,
      integration: 0,
    };

    for (const log of mergedLogs) {
      sources[log.source] += 1;
    }

    return {
      logs: mergedLogs,
      total: mergedLogs.length,
      sources,
      generatedAt: new Date(),
    };
  }
}
