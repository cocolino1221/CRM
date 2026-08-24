import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';
import { QUEUE_NAMES, JOB_TYPES } from '../../queues/queue.constants';

describe('WhatsAppFollowupDispatchService', () => {
  let service: WhatsAppFollowupDispatchService;
  let queue: any;

  beforeEach(async () => {
    queue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppFollowupDispatchService,
        { provide: getQueueToken(QUEUE_NAMES.SCHEDULED_TASKS), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppFollowupDispatchService);
  });

  it('includes targetStepId in the job payload when provided', async () => {
    await service.schedule('flow1', '407xxxxxxxx', 'ws1', 'step1', 5000, 'step2');
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      { workspaceId: 'ws1', waId: '407xxxxxxxx', flowId: 'flow1', armedStepId: 'step1', targetStepId: 'step2' },
      expect.objectContaining({ jobId: 'flow1:407xxxxxxxx', delay: 5000 }),
    );
  });

  it('omits targetStepId when not provided (existing timeoutBranch behavior)', async () => {
    await service.schedule('flow1', '407xxxxxxxx', 'ws1', 'step1', 5000);
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      { workspaceId: 'ws1', waId: '407xxxxxxxx', flowId: 'flow1', armedStepId: 'step1' },
      expect.objectContaining({ jobId: 'flow1:407xxxxxxxx', delay: 5000 }),
    );
  });
});
