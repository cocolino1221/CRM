import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queues/queue.constants';
import { Event, EventStatus } from '../database/entities/event.entity';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { MeetingReminderJobData } from './meeting-reminder-dispatch.service';

@Processor(QUEUE_NAMES.SCHEDULED_TASKS)
export class MeetingReminderProcessor {
  private readonly logger = new Logger(MeetingReminderProcessor.name);

  constructor(
    @InjectRepository(Event) private readonly eventRepository: Repository<Event>,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  @Process(JOB_TYPES.SEND_MEETING_REMINDER)
  async handle(job: Job<MeetingReminderJobData>) {
    const { workspaceId, eventId } = job.data;
    try {
      const event = await this.eventRepository.findOne({
        where: { id: eventId, workspaceId },
        relations: ['contact'],
      });
      if (!event) {
        this.logger.warn(`Meeting reminder: event ${eventId} not found, skipping`);
        return;
      }
      if (event.status !== EventStatus.SCHEDULED) {
        this.logger.log(`Meeting reminder: event ${eventId} is ${event.status}, not scheduled — skipping`);
        return;
      }
      if (new Date(event.startDate).getTime() <= Date.now()) {
        this.logger.log(`Meeting reminder: event ${eventId} start time already passed — skipping`);
        return;
      }

      const phone = event.contact?.phone;
      if (!phone) {
        this.logger.warn(`Meeting reminder: event ${eventId} has no linked contact with a phone number — skipping`);
        return;
      }

      const waId = phone.replace(/[^0-9]/g, '');
      const variables = { meetingLink: event.meetingLink || '' };
      const started = await this.whatsAppService.startMeetingReminderFlow(workspaceId, waId, variables);
      if (!started) {
        this.logger.log(`Meeting reminder: no enabled "before_meeting" flow for workspace ${workspaceId} — nothing sent`);
      }
    } catch (err: any) {
      this.logger.warn(`Meeting reminder failed for event ${eventId}: ${err?.message}`);
    }
  }
}
