#!/usr/bin/env node
/**
 * Removes the contacts that Meta messaging auto-created for Instagram and
 * Messenger senders — the ones carrying a placeholder address like
 * "instagram.1571288864466826@meta.placeholder.invalid", with no phone and no
 * real email.
 *
 * They come back on their own: meta-messaging looks a sender up by that exact
 * placeholder address and recreates the contact on the next inbound message.
 * Someone who never writes again, though, is gone — and their past activities
 * stay behind without a contact.
 *
 * Deleting is soft on the server (deletedAt is set, the row survives), but
 * nothing in the product undoes it, so treat it as final.
 *
 * Usage:
 *   CRM_TOKEN=... node scripts/delete-meta-placeholder-contacts.mjs
 *   CRM_TOKEN=... node scripts/delete-meta-placeholder-contacts.mjs --execute --expect 515
 *
 * The first form only counts and reports. The second deletes, and refuses
 * unless --expect matches what it actually found, so a search that suddenly
 * matches the whole workspace cannot empty it.
 */

const API = (process.env.CRM_API_URL || 'https://slackcrm-backend.fly.dev/api/v1').replace(/\/+$/, '');
const TOKEN = process.env.CRM_TOKEN;
const SUFFIX = '@meta.placeholder.invalid';
const PAGE_SIZE = 100;
const BATCH_SIZE = 100;

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const expectArg = args.indexOf('--expect');
const expected = expectArg === -1 ? null : Number(args[expectArg + 1]);

if (!TOKEN) {
  console.error('CRM_TOKEN is not set. Copy a logged-in access token and re-run.');
  process.exit(1);
}
if (execute && !Number.isInteger(expected)) {
  console.error('--execute requires --expect <n>: run once without --execute, then pass the count it reports.');
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Every contact whose email really ends in the placeholder suffix. */
async function collect() {
  const ids = [];
  const skipped = [];
  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const params = new URLSearchParams({
      search: 'meta.placeholder.invalid',
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const body = await call(`/contacts?${params}`);
    const rows = body.contacts ?? body.data ?? [];
    pages = body.totalPages ?? 1;

    for (const c of rows) {
      // The search is free text over name/email/phone. Only the email decides.
      if (typeof c.email === 'string' && c.email.toLowerCase().endsWith(SUFFIX)) ids.push(c.id);
      else skipped.push({ id: c.id, email: c.email });
    }

    process.stdout.write(`\rscanned page ${page}/${pages} — ${ids.length} matched`);
    page += 1;
  }

  process.stdout.write('\n');
  return { ids, skipped };
}

const { ids, skipped } = await collect();

console.log(`\n${ids.length} contacts carry a ${SUFFIX} address.`);
if (skipped.length) {
  console.log(`${skipped.length} matched the text search but not the address, and are left alone:`);
  for (const s of skipped.slice(0, 10)) console.log(`  ${s.id}  ${s.email}`);
  if (skipped.length > 10) console.log(`  … and ${skipped.length - 10} more`);
}

if (!execute) {
  console.log(`\nNothing was deleted. To delete these: --execute --expect ${ids.length}`);
  process.exit(0);
}

if (ids.length !== expected) {
  console.error(`\nRefusing: expected ${expected}, found ${ids.length}. Re-run without --execute and check.`);
  process.exit(1);
}

let deleted = 0;
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE);
  const res = await call('/contacts/bulk/delete', {
    method: 'POST',
    body: JSON.stringify({ ids: batch }),
  });
  deleted += res.deletedCount ?? batch.length;
  console.log(`deleted ${deleted}/${ids.length}`);
}

console.log(`\nDone. ${deleted} contacts removed.`);
