/**
 * One-off repair: two bookings made on 20 Oct 2026 never got a meeting link,
 * so neither the lead nor the closer was ever emailed. Both are confirmed and
 * still in the future — two people expecting a call with nothing to join.
 *
 * The two are named by id below; their meetings were on 22 and 26 Oct.
 *
 * Rescheduling them to the same hour would not have worked: moveMeeting
 * returns early when there is neither an externalMeetingId nor a link, so it
 * would have been a silent no-op — the same failure a second time.
 *
 * This calls setUpMeeting, the path production already uses, so the Zoom
 * meeting and both emails are the real ones. It must run ON the Fly machine:
 * ENCRYPTION_KEY, which decrypts the Zoom credentials, and RESEND_API_KEY
 * exist only there.
 *
 * Safe to re-run: a booking that already has a link is skipped, so a second
 * run cannot create a second meeting or send a second email.
 */

const BOOKINGS = [
  '4a4f83f5-4504-406c-bce0-808068b5a359',
  '91154bbf-66a1-44f6-9884-1e67d617162e',
];

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { getRepositoryToken } = require('@nestjs/typeorm');
  const { AppModule } = require('./dist/app.module');
  const { BookingMeetingsService } = require('./dist/bookings/booking-meetings.service');
  const { Booking } = require('./dist/database/entities/booking.entity');

  // Quiet: the app's own startup chatter would bury the two lines that matter.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const meetings = app.get(BookingMeetingsService);
    const bookings = app.get(getRepositoryToken(Booking));

    for (const id of BOOKINGS) {
      const booking = await bookings.findOne({ where: { id } });

      if (!booking) {
        console.log(id + '  NOT FOUND');
        continue;
      }
      if (booking.location && /^https?:\/\//i.test(booking.location)) {
        console.log(id + '  already has a link, skipped  ' + booking.location);
        continue;
      }
      if (booking.status !== 'confirmed') {
        console.log(id + '  status is ' + booking.status + ', skipped');
        continue;
      }

      const o = await meetings.setUpMeeting(id);
      console.log(
        id +
          '  provider=' + o.provider +
          '  emailed(lead=' + o.emailed.lead + ', host=' + o.emailed.host + ')' +
          '  link=' + (o.link || '-') +
          (o.warning ? '  WARNING: ' + o.warning : ''),
      );
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
