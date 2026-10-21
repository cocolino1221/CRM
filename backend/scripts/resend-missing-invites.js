/**
 * Send the invitation for two bookings whose Zoom meeting already exists.
 *
 * Companion to fix-missing-meeting-links.js. That one created the meetings,
 * but every email bounced: FROM_EMAIL was still onboarding@resend.dev, the
 * Resend sandbox sender, which refuses any recipient except the account
 * owner. Once FROM_EMAIL points at the verified domain, these two people
 * still need to be told — their meetings are on 22 and 26 Oct.
 *
 * Re-running setUpMeeting would create a second Zoom meeting, because the
 * bookings now carry an externalMeetingId. So this calls sendInvites on the
 * link already stored. It is private: deliberately reached into here rather
 * than widened on the service for a one-off, and the alternative — clearing
 * externalMeetingId to fall back into the fixed-link branch — would lie
 * about the booking in the database.
 *
 * Run ON the Fly machine, after FROM_EMAIL is set:
 *
 *   cd ~/Desktop/CRM/backend
 *   B64=$(base64 < scripts/resend-missing-invites.js | tr -d '\n')
 *   fly ssh console -C "sh -lc 'echo $B64 | base64 -d > /app/resend-invites.js && cd /app && node resend-invites.js'"
 *
 * Re-running sends the emails again, so run it once.
 */

/** Booking ids on the command line, else the two this was written for. */
const BOOKINGS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['4a4f83f5-4504-406c-bce0-808068b5a359', '91154bbf-66a1-44f6-9884-1e67d617162e'];

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { getRepositoryToken } = require('@nestjs/typeorm');
  const { AppModule } = require('./dist/app.module');
  const { BookingMeetingsService } = require('./dist/bookings/booking-meetings.service');
  const { Booking } = require('./dist/database/entities/booking.entity');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const meetings = app.get(BookingMeetingsService);
    const bookings = app.get(getRepositoryToken(Booking));

    // The sender is read per call from FROM_EMAIL; refuse to run on the
    // sandbox address rather than burn two more bounces.
    const from = process.env.FROM_EMAIL || '';
    if (/resend\.dev$/i.test(from) || !from) {
      console.log(`FROM_EMAIL is "${from || '(unset)'}" — set it to the verified domain first. Nothing sent.`);
      return;
    }

    for (const id of BOOKINGS) {
      const booking = await bookings.findOne({
        where: { id },
        // sendInvites reads all three.
        relations: ['host', 'contact', 'meetingType'],
      });

      if (!booking) {
        console.log(id + '  NOT FOUND');
        continue;
      }
      if (!booking.location || !/^https?:\/\//i.test(booking.location)) {
        console.log(id + '  has no link yet — run fix-missing-meeting-links.js first');
        continue;
      }

      const sent = await meetings.sendInvites(booking, booking.location, 'zoom');
      console.log(`${id}  lead=${sent.lead}  host=${sent.host}  ${booking.location}`);
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
