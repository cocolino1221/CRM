import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace, WorkspaceSettings } from '../database/entities/workspace.entity';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  /**
   * Persist (or clear) the workspace's custom logo URL, shown by the mobile app
   * instead of the default EasyTeam logo. Merges into the existing JSONB
   * `settings` blob so other keys (timezone, currency, features, audioLibrary,
   * etc.) are preserved. The actual image upload happens via the existing
   * `/upload` endpoint — this only stores the resulting URL.
   */
  async setBranding(
    workspaceId: string,
    brandLogoUrl: string | null,
  ): Promise<WorkspaceSettings> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    workspace.settings = {
      ...(workspace.settings || ({} as WorkspaceSettings)),
      brandLogoUrl: brandLogoUrl || undefined,
    };

    await this.workspaceRepository.save(workspace);
    return workspace.settings;
  }
}
