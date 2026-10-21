import { ForbiddenException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService.remove — who may delete', () => {
  const task = { id: 't1', workspaceId: 'ws', assigneeId: 'caller-1', creatorId: 'closer-9' };
  const build = () => {
    const repo: any = { softDelete: jest.fn().mockResolvedValue(undefined) };
    const service = new TasksService(repo, { emit: jest.fn() } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(task as any);
    return { service, repo };
  };

  it('lets the person the task is for delete it', async () => {
    const { service, repo } = build();
    await service.remove('ws', 't1', { id: 'caller-1', role: 'caller' });
    expect(repo.softDelete).toHaveBeenCalledWith('t1');
  });

  it('lets whoever made it delete it', async () => {
    const { service, repo } = build();
    await service.remove('ws', 't1', { id: 'closer-9', role: 'closer' });
    expect(repo.softDelete).toHaveBeenCalled();
  });

  it('refuses a colleague', async () => {
    const { service, repo } = build();
    await expect(service.remove('ws', 't1', { id: 'other', role: 'closer' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('lets whoever runs the team delete anything', async () => {
    for (const role of ['admin', 'manager', 'super_admin']) {
      const { service, repo } = build();
      await service.remove('ws', 't1', { id: 'boss', role });
      expect(repo.softDelete).toHaveBeenCalled();
    }
  });
});
