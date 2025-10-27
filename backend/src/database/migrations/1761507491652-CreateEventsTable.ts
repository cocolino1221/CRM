import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEventsTable1761507491652 implements MigrationInterface {
    name = 'CreateEventsTable1761507491652'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."events_type_enum" AS ENUM('meeting', 'call', 'task', 'deadline', 'appointment')`);
        await queryRunner.query(`CREATE TYPE "public"."events_status_enum" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled')`);
        await queryRunner.query(`CREATE TYPE "public"."events_meetingplatform_enum" AS ENUM('zoom', 'google_meet', 'microsoft_teams', 'phone', 'in_person', 'other')`);
        await queryRunner.query(`CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text, "type" "public"."events_type_enum" NOT NULL DEFAULT 'meeting', "status" "public"."events_status_enum" NOT NULL DEFAULT 'scheduled', "startDate" TIMESTAMP WITH TIME ZONE NOT NULL, "endDate" TIMESTAMP WITH TIME ZONE NOT NULL, "isAllDay" boolean NOT NULL DEFAULT false, "location" character varying(255), "meetingPlatform" "public"."events_meetingplatform_enum", "meetingLink" text, "meetingId" character varying(100), "meetingPassword" character varying(100), "color" character varying(50), "reminders" jsonb, "isRecurring" boolean NOT NULL DEFAULT false, "recurrenceRule" jsonb, "externalEventId" character varying(255), "source" character varying(50), "customFields" jsonb, "organizerId" uuid NOT NULL, "contactId" uuid, "dealId" uuid, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id")); COMMENT ON COLUMN "events"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "events"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "events"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "events"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "events"."title" IS 'Event title'; COMMENT ON COLUMN "events"."description" IS 'Event description'; COMMENT ON COLUMN "events"."type" IS 'Type of event'; COMMENT ON COLUMN "events"."status" IS 'Event status'; COMMENT ON COLUMN "events"."startDate" IS 'Event start date and time'; COMMENT ON COLUMN "events"."endDate" IS 'Event end date and time'; COMMENT ON COLUMN "events"."isAllDay" IS 'Is all day event'; COMMENT ON COLUMN "events"."location" IS 'Event location or meeting link'; COMMENT ON COLUMN "events"."meetingPlatform" IS 'Meeting platform if virtual'; COMMENT ON COLUMN "events"."meetingLink" IS 'Meeting link (Zoom, Google Meet, etc)'; COMMENT ON COLUMN "events"."meetingId" IS 'Meeting ID or room number'; COMMENT ON COLUMN "events"."meetingPassword" IS 'Meeting password'; COMMENT ON COLUMN "events"."color" IS 'Event color for calendar display'; COMMENT ON COLUMN "events"."reminders" IS 'Reminder settings'; COMMENT ON COLUMN "events"."isRecurring" IS 'Is recurring event'; COMMENT ON COLUMN "events"."recurrenceRule" IS 'Recurrence rule'; COMMENT ON COLUMN "events"."externalEventId" IS 'External calendar event ID (Google Calendar, Outlook, etc)'; COMMENT ON COLUMN "events"."source" IS 'Source of event (calendly, google_calendar, manual, etc)'; COMMENT ON COLUMN "events"."customFields" IS 'Custom fields for additional data'; COMMENT ON COLUMN "events"."organizerId" IS 'Event organizer/creator'; COMMENT ON COLUMN "events"."contactId" IS 'Related contact'; COMMENT ON COLUMN "events"."dealId" IS 'Related deal'`);
        await queryRunner.query(`CREATE INDEX "IDX_events_start_date" ON "events" ("startDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_events_organizer" ON "events" ("organizerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_events_workspace_date" ON "events" ("workspaceId", "startDate") `);
        await queryRunner.query(`CREATE TABLE "event_attendees" ("eventId" uuid NOT NULL, "userId" uuid NOT NULL, CONSTRAINT "PK_edb4129eb44589ffaccce13f6ce" PRIMARY KEY ("eventId", "userId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_21056813ffb169d392d38a40c2" ON "event_attendees" ("eventId") `);
        await queryRunner.query(`CREATE INDEX "IDX_07eb323a7b08ba51fe4b582f3f" ON "event_attendees" ("userId") `);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_1024d476207981d1c72232cf3ca" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_19954888422a82f66246d99dbc7" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_746d6af21c8a93c794a2ba1ffa0" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_attendees" ADD CONSTRAINT "FK_21056813ffb169d392d38a40c2d" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "event_attendees" ADD CONSTRAINT "FK_07eb323a7b08ba51fe4b582f3f4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "event_attendees" DROP CONSTRAINT "FK_07eb323a7b08ba51fe4b582f3f4"`);
        await queryRunner.query(`ALTER TABLE "event_attendees" DROP CONSTRAINT "FK_21056813ffb169d392d38a40c2d"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_746d6af21c8a93c794a2ba1ffa0"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_19954888422a82f66246d99dbc7"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_1024d476207981d1c72232cf3ca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_07eb323a7b08ba51fe4b582f3f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_21056813ffb169d392d38a40c2"`);
        await queryRunner.query(`DROP TABLE "event_attendees"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_events_workspace_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_events_organizer"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_events_start_date"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TYPE "public"."events_meetingplatform_enum"`);
        await queryRunner.query(`DROP TYPE "public"."events_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."events_type_enum"`);
    }

}
