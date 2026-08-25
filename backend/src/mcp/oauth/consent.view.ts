export interface ConsentViewParams {
  clientId: string;
  clientName: string;
  workspaceName: string;
  scopes: string[];
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  /** CSRF nonce (see McpOauthService.issueConsentNonce) mirrored into the form. */
  csrf: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Friendly, human-readable copy for each scope shown on the consent screen. */
const SCOPE_INFO: Record<string, { title: string; description: string }> = {
  'crm.read': {
    title: 'Read your CRM data',
    description: 'View contacts, deals, tasks, and analytics in your workspace.',
  },
  'crm.write': {
    title: 'Create & update records',
    description: 'Create and edit contacts, deals, and tasks on your behalf.',
  },
  'crm.automations': {
    title: 'Run automations',
    description:
      'Trigger workflows and send WhatsApp / email campaigns — always with an explicit confirmation.',
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Consent screen for the MCP OAuth authorize step. Lists the requesting client,
 * the workspace being granted access to, and the requested scopes, then posts
 * the same params to the consent endpoint.
 */
export function renderConsentPage(params: ConsentViewParams): string {
  const scopeItems = params.scopes.length
    ? params.scopes
        .map((scope) => {
          const info = SCOPE_INFO[scope];
          const title = escapeHtml(info?.title ?? scope);
          const description = escapeHtml(info?.description ?? '');
          const raw = escapeHtml(scope);
          return `
        <li class="scope">
          <span class="scope__check" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>
          </span>
          <span class="scope__body">
            <span class="scope__title">${title}</span>
            <span class="scope__desc">${description}</span>
            <span class="scope__code">${raw}</span>
          </span>
        </li>`;
        })
        .join('')
    : '<li class="scope"><span class="scope__body"><span class="scope__title">No specific permissions requested</span></span></li>';

  const hiddenFields: Array<[string, string]> = [
    ['client_id', params.clientId],
    ['redirect_uri', params.redirectUri],
    ['response_type', params.responseType],
    ['code_challenge', params.codeChallenge],
    ['code_challenge_method', params.codeChallengeMethod],
    ['state', params.state ?? ''],
    ['scope', params.scopes.join(' ')],
    ['csrf', params.csrf],
  ];

  const hiddenFieldsHtml = hiddenFields
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join('\n      ');

  const clientName = escapeHtml(params.clientName);
  const workspaceName = escapeHtml(params.workspaceName || 'your workspace');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Authorize ${clientName}</title>
  <style>
    :root {
      --bg1: #eef2ff; --bg2: #faf5ff; --card: #ffffff; --ink: #0f172a;
      --muted: #64748b; --line: #e2e8f0; --brand: #4f46e5; --brand2: #7c3aed;
      --ok: #16a34a; --ring: rgba(79,70,229,.35);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 15% -10%, var(--bg1), transparent 60%),
        radial-gradient(1000px 500px at 100% 0%, var(--bg2), transparent 55%),
        #f8fafc;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      width: 100%; max-width: 440px; background: var(--card);
      border: 1px solid var(--line); border-radius: 20px;
      box-shadow: 0 24px 60px -18px rgba(15,23,42,.25), 0 4px 12px -6px rgba(15,23,42,.12);
      overflow: hidden;
    }
    .card__top { padding: 28px 28px 8px; text-align: center; }
    .brand { display: inline-flex; align-items: center; gap: 8px; color: var(--brand); font-weight: 700; font-size: 13px; letter-spacing: .02em; margin-bottom: 20px; }
    .brand__dot { width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg, var(--brand), var(--brand2)); display:inline-flex; align-items:center; justify-content:center; color:#fff; }
    .parties { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 18px; }
    .avatar { width: 56px; height: 56px; border-radius: 16px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; color:#fff; box-shadow: 0 6px 16px -6px rgba(79,70,229,.5); }
    .avatar--client { background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    .avatar--ws { background: linear-gradient(135deg, var(--brand), var(--brand2)); }
    .parties__link { color: var(--muted); }
    .parties__link svg { display:block; }
    h1 { font-size: 20px; line-height: 1.35; margin: 0 8px 6px; font-weight: 700; }
    h1 .name { color: var(--brand); }
    .sub { color: var(--muted); font-size: 14px; margin: 0 8px; }
    .scopes { list-style: none; margin: 22px 0 8px; padding: 0 28px; }
    .scope { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--line); }
    .scope:first-child { border-top: none; }
    .scope__check { flex: none; width: 24px; height: 24px; border-radius: 999px; background: #dcfce7; color: var(--ok); display:flex; align-items:center; justify-content:center; margin-top: 1px; }
    .scope__body { display: flex; flex-direction: column; gap: 2px; }
    .scope__title { font-weight: 600; font-size: 14.5px; }
    .scope__desc { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .scope__code { align-self: flex-start; margin-top: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569; background: #f1f5f9; border:1px solid var(--line); padding: 1px 7px; border-radius: 999px; }
    .actions { padding: 20px 28px 24px; display: flex; flex-direction: column; gap: 10px; }
    button { font: inherit; cursor: pointer; border-radius: 12px; padding: 12px 16px; font-weight: 600; font-size: 15px; border: 1px solid transparent; transition: transform .04s ease, box-shadow .2s ease, background .2s ease; }
    button:active { transform: translateY(1px); }
    .btn-allow { color: #fff; background: linear-gradient(135deg, var(--brand), var(--brand2)); box-shadow: 0 10px 22px -10px var(--ring); }
    .btn-allow:hover { box-shadow: 0 14px 28px -10px var(--ring); }
    .btn-deny { color: var(--ink); background: #fff; border-color: var(--line); }
    .btn-deny:hover { background: #f8fafc; }
    .foot { padding: 0 28px 26px; color: var(--muted); font-size: 12px; text-align: center; line-height: 1.5; }
    .foot strong { color: #334155; font-weight: 600; }
    @media (prefers-color-scheme: dark) {
      :root { --card:#0b1220; --ink:#e5e7eb; --muted:#94a3b8; --line:#1e293b; }
      body { background: radial-gradient(1200px 600px at 15% -10%, #1e1b4b, transparent 60%), radial-gradient(1000px 500px at 100% 0%, #2e1065, transparent 55%), #020617; }
      .scope__code { background:#0f172a; color:#cbd5e1; }
      .btn-deny { background:#0b1220; }
      .btn-deny:hover { background:#111827; }
    }
  </style>
</head>
<body>
  <main class="card" role="dialog" aria-labelledby="title">
    <div class="card__top">
      <div class="brand"><span class="brand__dot">◆</span> easyteamcrm</div>
      <div class="parties">
        <span class="avatar avatar--client" title="${clientName}">${escapeHtml(initials(params.clientName))}</span>
        <span class="parties__link" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg>
        </span>
        <span class="avatar avatar--ws" title="${workspaceName}">${escapeHtml(initials(params.workspaceName || 'W'))}</span>
      </div>
      <h1 id="title"><span class="name">${clientName}</span> wants to access <span class="name">${workspaceName}</span></h1>
      <p class="sub">Connecting will let this AI assistant work with your CRM data with the permissions below.</p>
    </div>

    <ul class="scopes">
      ${scopeItems}
    </ul>

    <form method="POST" action="/api/v1/oauth/mcp/authorize/consent">
      ${hiddenFieldsHtml}
      <div class="actions">
        <button type="submit" name="decision" value="approve" class="btn-allow">Allow access</button>
        <button type="submit" name="decision" value="deny" class="btn-deny">Cancel</button>
      </div>
    </form>

    <p class="foot">
      You can revoke this access anytime in <strong>Integrations → AI Connect</strong>.
      Destructive actions always require the assistant to confirm.
    </p>
  </main>
</body>
</html>`;
}
