import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { Activity, ActivityType } from '../database/entities/activity.entity';

// Minimal mock repository — only the methods ActivitiesService uses.
const createMockRepository = () => ({
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ActivitiesService', () => {
  const workspaceId = 'workspace-1';
  let repository: ReturnType<typeof createMockRepository>;
  let service: ActivitiesService;

  beforeEach(() => {
    repository = createMockRepository();
    service = new ActivitiesService(repository as any);
  });

  describe('findAll', () => {
    it('filters by workspaceId', async () => {
      await service.findAll(workspaceId, {});

      const [options] = repository.findAndCount.mock.calls[0];
      expect(options.where).toMatchObject({ workspaceId });
    });

    it('applies contactId and type filters when given', async () => {
      await service.findAll(workspaceId, {
        contactId: 'contact-1',
        type: ActivityType.CALL,
      });

      const [options] = repository.findAndCount.mock.calls[0];
      expect(options.where).toMatchObject({
        workspaceId,
        contactId: 'contact-1',
        type: ActivityType.CALL,
      });
    });

    it('returns data and total', async () => {
      const activity = Object.assign(new Activity(), { id: 'activity-1' });
      repository.findAndCount.mockResolvedValue([[activity], 1]);

      await expect(service.findAll(workspaceId, {})).resolves.toEqual({
        data: [activity],
        total: 1,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an activity in another workspace', async () => {
      // The repository is scoped by workspaceId, so a foreign id resolves to null.
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne(workspaceId, 'activity-elsewhere')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const [options] = repository.findOne.mock.calls[0];
      expect(options.where).toMatchObject({ workspaceId, id: 'activity-elsewhere' });
    });

    it('returns the activity when it belongs to the workspace', async () => {
      const activity = Object.assign(new Activity(), { id: 'activity-1', workspaceId });
      repository.findOne.mockResolvedValue(activity);

      await expect(service.findOne(workspaceId, 'activity-1')).resolves.toBe(activity);
    });
  });
});
