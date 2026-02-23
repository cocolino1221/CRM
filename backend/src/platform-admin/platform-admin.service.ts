import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';

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

  async getOverview() {
    const workspaces = await this.workspaceRepository.find({
      select: ['id', 'name', 'domain', 'plan', 'isActive', 'createdAt'],
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
      select: ['id', 'workspaceId', 'firstName', 'lastName', 'email'],
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

    const usersByWorkspace = new Map<string, Array<{ id: string; name: string }>>();
    for (const user of users) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      const bucket = usersByWorkspace.get(user.workspaceId) || [];
      bucket.push({ id: user.id, name: fullName });
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
}

