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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minimal consent screen for the MCP OAuth authorize step.
 * Lists the requesting client, the workspace being granted access to, and
 * the requested scopes, then posts the same params to the consent endpoint.
 */
export function renderConsentPage(params: ConsentViewParams): string {
  const scopeItems = params.scopes.length
    ? params.scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join('')
    : '<li>(no scopes requested)</li>';

  const hiddenFields: Array<[string, string]> = [
    ['client_id', params.clientId],
    ['redirect_uri', params.redirectUri],
    ['response_type', params.responseType],
    ['code_challenge', params.codeChallenge],
    ['code_challenge_method', params.codeChallengeMethod],
    ['state', params.state ?? ''],
    ['scope', params.scopes.join(' ')],
  ];

  const hiddenFieldsHtml = hiddenFields
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Authorize ${escapeHtml(params.clientName)}</title>
</head>
<body>
  <h1>${escapeHtml(params.clientName)} would like to access ${escapeHtml(params.workspaceName)}</h1>
  <p>This will allow the application to:</p>
  <ul>
    ${scopeItems}
  </ul>
  <form method="POST" action="/api/v1/oauth/mcp/authorize/consent">
    ${hiddenFieldsHtml}
    <button type="submit" name="decision" value="approve">Allow</button>
    <button type="submit" name="decision" value="deny">Deny</button>
  </form>
</body>
</html>`;
}
