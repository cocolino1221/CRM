import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROD_URL = 'https://etcrm.primafisoft.com';
const API_URL  = 'https://slackcrm-backend.fly.dev/api/v1';
const VIDEO_OUT = path.join(os.homedir(), 'Desktop', 'meta-messenger-demo');

const SENDER_ID   = 'demo_client_fb_99001';
const SENDER_NAME = 'Maria Demo (Meta Review)';
const INBOUND_MSG = "Hi! I just saw your ad and I'm really interested in your services. Can you tell me more about pricing?";
const REPLY_MSG   = "Hi Maria! Thanks for reaching out 😊 We'd love to help. Could you share a bit more about what you're looking for so I can point you in the right direction right away?";

async function slowType(locator, text) {
  await locator.click();
  await locator.fill('');
  for (const ch of text) {
    await locator.type(ch, { delay: 32 });
  }
}

// Wait until localStorage.accessToken is present (up to maxMs)
async function waitForToken(page, maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const token = await page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null);
    if (token && token !== 'null') return token;
    await page.waitForTimeout(1500);
    process.stdout.write('.');
  }
  return null;
}

(async () => {
  console.log('\n🎬  META APP REVIEW — Screen Recorder\n');
  fs.mkdirSync(VIDEO_OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,900', '--window-position=0,0', '--disable-infobars'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO_OUT, size: { width: 1440, height: 900 } },
  });

  const page = await context.newPage();

  // ── Navighează la login ───────────────────────────────────────────────────
  console.log('🔀  Deschid pagina de login...');
  await page.goto(`${PROD_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ── Verifică dacă deja e logat ───────────────────────────────────────────
  let jwt = await page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null);

  if (!jwt || jwt === 'null') {
    console.log('\n👤  Loghează-te în fereastra browserului deschis...');
    console.log('   • Email: contact@primafisoft.com');
    console.log('   • Introdu parola și apasă Login (sau folosește Google)\n');
    console.log('   Aștept până la 2 minute...\n');

    // Asteaptă redirect COMPLET la dashboard/meta-inbox
    // IMPORTANT: verificăm pathname (nu tot URL-ul) ca să nu match-uim /login?redirect=/meta-inbox
    await page.waitForURL(url => {
      try {
        const pathname = new URL(url).pathname;
        return pathname === '/meta-inbox' || pathname === '/dashboard' ||
               pathname.startsWith('/contacts') || pathname.startsWith('/deals');
      } catch { return false; }
    }, { timeout: 120000 }).catch(() => {});

    // Navighează explicit la meta-inbox dacă nu suntem deja acolo
    const afterLoginUrl = new URL(page.url()).pathname;
    if (afterLoginUrl !== '/meta-inbox') {
      await page.goto(`${PROD_URL}/meta-inbox`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(2000);

    // Debug: afișează URL-ul curent și tot ce e în localStorage
    const currentUrl = page.url();
    console.log(`\n  URL curent: ${currentUrl}`);
    const lsKeys = await page.evaluate(() => {
      const keys = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        keys[k] = v ? v.slice(0, 60) : v;
      }
      return keys;
    }).catch(() => ({}));
    console.log('  localStorage:', JSON.stringify(lsKeys, null, 2));

    // Asteaptă token cu polling (token poate fi setat async după redirect)
    console.log('\n⏳  Aștept token JWT...');
    jwt = await waitForToken(page, 20000);
    console.log('');
  }

  // Fallback: dacă nu avem jwt dar suntem pe meta-inbox, facem apelul din browser
  const _pathname = new URL(page.url()).pathname;
  const onMetaInbox = _pathname === '/meta-inbox' || _pathname === '/dashboard' || _pathname.startsWith('/contacts');
  if (!jwt || jwt === 'null') {
    if (!onMetaInbox) {
      console.error('\n❌  Token JWT nu a apărut și nu suntem pe pagina CRM.');
      await browser.close();
      process.exit(1);
    }
    console.log('\n⚠️  accessToken nu e în localStorage — voi face simulate din browser (cu cookies).');
  } else {
    console.log('\n✅  Logat cu succes! JWT obținut.');
  }

  // ── Mergi la meta-inbox ──────────────────────────────────────────────────
  if (new URL(page.url()).pathname !== '/meta-inbox') {
    console.log('🔀  Navighează la Messages...');
    await page.goto(`${PROD_URL}/meta-inbox`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }

  // ── Simulate inbound Messenger ────────────────────────────────────────────
  console.log(`\n📨  Simulez mesaj Messenger inbound de la "${SENDER_NAME}"...`);

  // Dacă avem JWT, facem din Node.js; altfel, din browser cu cookies
  let simStatus = 0;
  let simBodyText = '';
  if (jwt && jwt !== 'null') {
    const simResp = await fetch(`${API_URL}/integrations/meta-messaging/simulate/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ channel: 'messenger', from: SENDER_ID, senderName: SENDER_NAME, text: INBOUND_MSG }),
    });
    simStatus = simResp.status;
    simBodyText = JSON.stringify(await simResp.json().catch(() => ({}))).slice(0, 120);
  } else {
    const result = await page.evaluate(async ({ apiUrl, senderId, senderName, inboundMsg }) => {
      try {
        const r = await fetch(`${apiUrl}/integrations/meta-messaging/simulate/inbound`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ channel: 'messenger', from: senderId, senderName, text: inboundMsg }),
        });
        const body = await r.json().catch(() => ({}));
        return { status: r.status, body: JSON.stringify(body).slice(0, 120) };
      } catch (e) {
        return { status: 0, body: e.message };
      }
    }, { apiUrl: API_URL, senderId: SENDER_ID, senderName: SENDER_NAME, inboundMsg: INBOUND_MSG });
    simStatus = result.status;
    simBodyText = result.body;
  }

  console.log(`  → Status ${simStatus}: ${simBodyText}`);
  if (simStatus !== 200 && simStatus !== 201) {
    console.error('\n❌  Simularea a eșuat. Detalii:', simBodyText);
    await browser.close();
    process.exit(1);
  }
  console.log('✅  Mesaj inbound simulat cu succes!');

  // ── Refresh inbox ────────────────────────────────────────────────────────
  console.log('\n🔄  Refresh inbox...');
  await page.waitForTimeout(1500);
  const refreshBtn = page.locator('button', { hasText: 'Refresh' }).first();
  if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await refreshBtn.click();
  }
  await page.waitForTimeout(3500);

  // ── Selectează conversația demo ──────────────────────────────────────────
  console.log('💬  Selectez conversația...');
  const convByName = page.locator(`aside button:has-text("${SENDER_NAME}")`).first();
  const firstConv  = page.locator('aside button').first();

  if (await convByName.isVisible({ timeout: 5000 }).catch(() => false)) {
    await convByName.click();
    console.log(`  → Conversație "${SENDER_NAME}" selectată`);
  } else {
    console.log('  → Folosesc prima conversație din inbox');
    if (await firstConv.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstConv.click();
    }
  }
  await page.waitForTimeout(2500);

  // ── Scroll la ultimul mesaj ──────────────────────────────────────────────
  await page.evaluate(() => {
    const area = document.querySelector('main .overflow-y-auto, main .flex-1');
    if (area) area.scrollTop = area.scrollHeight;
  });
  await page.waitForTimeout(1200);

  // ── Scrie și trimite reply ────────────────────────────────────────────────
  console.log('✍️   Scriu reply-ul...');
  const textarea = page.locator('textarea').first();

  if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await slowType(textarea, REPLY_MSG);
    await page.waitForTimeout(1000);

    console.log('📤  Trimit mesajul...');
    const sendBtn = page.locator('button', { hasText: 'Send' }).last();
    if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await textarea.press('Meta+Enter');
    }
    await page.waitForTimeout(3000);
    console.log('✅  Reply trimis!');
  } else {
    console.warn('⚠️  Textarea nu e vizibil — integrarea Messenger nu e conectată');
  }

  // ── Pauza finală ─────────────────────────────────────────────────────────
  console.log('\n📸  Pauza finală...');
  await page.waitForTimeout(5000);

  // ── Salvează video ─────────────────────────────────────────────────────────
  const videoFile = await page.video()?.path();
  await context.close();
  await browser.close();

  console.log('\n' + '═'.repeat(60));
  console.log('✅  RECORDING COMPLET!');
  if (videoFile) {
    const dest = path.join(os.homedir(), 'Desktop', 'meta-messenger-demo.webm');
    try {
      fs.copyFileSync(videoFile, dest);
      console.log(`🎥  Video salvat: ${dest}`);
    } catch {
      console.log(`🎥  Video raw: ${videoFile}`);
    }
  }
  console.log('═'.repeat(60) + '\n');
})().catch(err => {
  console.error('\n❌  Eroare fatală:', err.message);
  process.exit(1);
});
