import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../database/entities/activity.entity';
import {
  computeRates,
  emptyCounts,
  hasActivity,
  sumCounts,
  type ReportCounts,
  type UserReportRow,
} from './user-report';

const ANSWERED = `('successful', 'scheduled', 'failed')`;
const NOT_ANSWERED = `('no_answer', 'voicemail', 'busy')`;

/**
 * One query per kind of work, grouped by person, over [from, to]. Raw SQL
 * through the activity repository's manager: the report reads five tables,
 * and importing their entities here would only add to the module's load-order
 * fragility (see AnalyticsService.getWorkspaceTimeZone).
 */
@Injectable()
export class UserReportService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  private q(sql: string, params: any[]): Promise<any[]> {
    return this.activityRepository.manager.query(sql, params);
  }

  async getReport(
    workspaceId: string,
    from: Date,
    to: Date,
    onlyUserId?: string,
  ): Promise<{ from: string; to: string; users: UserReportRow[]; totals: UserReportRow }> {
    const p = [workspaceId, from, to];

    const [users, calls, received, set, deals, created, done, overdue] = await Promise.all([
      this.q(
        `SELECT id, "firstName", "lastName", email, role::text AS role FROM users
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [workspaceId],
      ),
      this.q(
        `SELECT "userId" AS uid,
           count(*)::int AS total,
           count(*) FILTER (WHERE outcome::text IN ${ANSWERED})::int AS answered,
           count(*) FILTER (WHERE outcome::text IN ${NOT_ANSWERED})::int AS "notAnswered",
           count(*) FILTER (WHERE outcome::text = 'failed')::int AS refused,
           count(*) FILTER (WHERE outcome::text = 'scheduled')::int AS booked
         FROM activities
         WHERE "workspaceId" = $1 AND type = 'call' AND "deletedAt" IS NULL AND "userId" IS NOT NULL
           AND COALESCE("occurredAt", "createdAt") BETWEEN $2 AND $3
         GROUP BY "userId"`,
        p,
      ),
      // A closer's diary: bookings made in the period, and meetings that were
      // due in it and what became of them.
      this.q(
        `SELECT "hostId" AS uid,
           count(*) FILTER (WHERE "createdAt" BETWEEN $2 AND $3)::int AS received,
           -- Held: marked so, or over and still confirmed — closers rarely mark
           -- a meeting that went fine, and only a no-show is worth flagging.
           count(*) FILTER (WHERE "startTime" BETWEEN $2 AND $3
             AND (status = 'completed' OR (status = 'confirmed' AND "endTime" < now())))::int AS held,
           count(*) FILTER (WHERE "startTime" BETWEEN $2 AND $3 AND status = 'no_show')::int AS "noShow",
           count(*) FILTER (WHERE "startTime" BETWEEN $2 AND $3 AND status = 'cancelled')::int AS cancelled
         FROM bookings
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
           AND ("createdAt" BETWEEN $2 AND $3 OR "startTime" BETWEEN $2 AND $3)
         GROUP BY "hostId"`,
        p,
      ),
      // A caller's or setter's bookings: those made in the period for leads
      // they are tagged on. Someone tagged as both counts the booking once.
      this.q(
        `SELECT x.uid, count(DISTINCT b.id)::int AS set
         FROM bookings b
         JOIN contacts c ON c.id = b."contactId"
         CROSS JOIN LATERAL (VALUES (c."callerId"), (c."setterId")) AS x(uid)
         WHERE b."workspaceId" = $1 AND b."deletedAt" IS NULL AND x.uid IS NOT NULL
           AND b."createdAt" BETWEEN $2 AND $3
         GROUP BY x.uid`,
        p,
      ),
      this.q(
        `SELECT "ownerId" AS uid, stage::text AS stage, COALESCE(currency, 'RON') AS currency,
           count(*)::int AS n, COALESCE(sum(value), 0)::float AS value
         FROM deals
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "ownerId" IS NOT NULL
           AND stage::text IN ('closed_won', 'closed_lost')
           AND COALESCE("actualCloseDate", "updatedAt") BETWEEN $2 AND $3
         GROUP BY "ownerId", stage, currency`,
        p,
      ),
      this.q(
        `SELECT "assigneeId" AS uid, count(*)::int AS n FROM tasks
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "assigneeId" IS NOT NULL
           AND "createdAt" BETWEEN $2 AND $3
         GROUP BY "assigneeId"`,
        p,
      ),
      this.q(
        `SELECT "assigneeId" AS uid, count(*)::int AS n FROM tasks
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "assigneeId" IS NOT NULL
           AND status::text = 'completed' AND "completedAt" BETWEEN $2 AND $3
         GROUP BY "assigneeId"`,
        p,
      ),
      // Overdue is a state of now, not of the period: what is late today.
      this.q(
        `SELECT "assigneeId" AS uid, count(*)::int AS n FROM tasks
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "assigneeId" IS NOT NULL
           AND status::text IN ('pending', 'in_progress', 'overdue') AND "dueDate" < now()
         GROUP BY "assigneeId"`,
        [workspaceId],
      ),
    ]);

    const counts = new Map<string, ReportCounts>();
    const of = (uid: string) => {
      if (!counts.has(uid)) counts.set(uid, emptyCounts());
      return counts.get(uid)!;
    };

    for (const r of calls) Object.assign(of(r.uid).calls, {
      total: r.total, answered: r.answered, notAnswered: r.notAnswered, refused: r.refused, booked: r.booked,
    });
    for (const r of received) Object.assign(of(r.uid).bookings, {
      received: r.received, held: r.held, noShow: r.noShow, cancelled: r.cancelled,
    });
    for (const r of set) of(r.uid).bookings.set = r.set;
    for (const r of deals) {
      const sales = of(r.uid).sales;
      if (r.stage === 'closed_won') {
        sales.won += r.n;
        sales.revenue += Number(r.value) || 0;
        sales.revenueByCurrency[r.currency] = (sales.revenueByCurrency[r.currency] || 0) + (Number(r.value) || 0);
      } else {
        sales.lost += r.n;
      }
    }
    for (const r of created) of(r.uid).followUps.created = r.n;
    for (const r of done) of(r.uid).followUps.done = r.n;
    for (const r of overdue) of(r.uid).followUps.overdue = r.n;

    const rows: UserReportRow[] = [];
    for (const u of users) {
      if (onlyUserId && u.id !== onlyUserId) continue;
      const c = counts.get(u.id) ?? emptyCounts();
      // A manager sees only people who did something; one person's own
      // report shows up even when it is all zeros.
      if (!onlyUserId && !hasActivity(c)) continue;
      rows.push({
        userId: u.id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'Utilizator',
        role: u.role ?? null,
        ...c,
        rates: computeRates(c),
      });
    }
    rows.sort((a, b) => b.sales.won - a.sales.won || b.calls.total - a.calls.total);

    const totalCounts = sumCounts(rows);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      users: rows,
      totals: { userId: 'total', name: 'Total echipă', role: null, ...totalCounts, rates: computeRates(totalCounts) },
    };
  }
}
