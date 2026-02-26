import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';

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

@Injectable()
export class PlatformAdminService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
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

  private extractWorkspaceFeatures(workspace: Workspace): WorkspaceFeatureFlags {
    const settings = workspace?.settings && typeof workspace.settings === 'object' ? workspace.settings : {};
    const features = (settings as any).features;
    return this.sanitizeFeatures(features);
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
}
