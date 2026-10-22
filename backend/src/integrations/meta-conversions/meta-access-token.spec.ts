import { accessTokenProblem, cleanAccessToken, redactToken } from './meta-access-token';

describe('cleanAccessToken', () => {
  // Meta system-user tokens are 200+ chars and pick up line wrapping on
  // copy-paste, which on its own makes Graph answer "Bad signature".
  it('strips every kind of whitespace, not just the ends', () => {
    expect(cleanAccessToken('  EAA\nabc\t def \r\n')).toBe('EAAabcdef');
  });

  it('copes with a missing value', () => {
    expect(cleanAccessToken(undefined)).toBe('');
    expect(cleanAccessToken(null)).toBe('');
  });
});

describe('accessTokenProblem', () => {
  const realisticToken = 'EAA' + 'Qwerty1234_-'.repeat(18); // 219 chars, like a system-user token

  it('accepts a token shaped like the real thing', () => {
    expect(realisticToken.length).toBeGreaterThan(200);
    expect(accessTokenProblem(realisticToken)).toBeNull();
  });

  // What was actually in the database: a ~2.7 KB blob where the token should
  // be, which Graph answered with "Bad signature" on every event.
  it('rejects a value far too long to be a token, and says how long it is', () => {
    const problem = accessTokenProblem('E'.repeat(2698));

    expect(problem).toContain('2698');
    expect(problem).toContain('cURL');
  });

  it('rejects a value too short to be a token', () => {
    expect(accessTokenProblem('EAAabc')).toMatch(/too short|only 6/i);
  });

  it('rejects a pasted cURL command', () => {
    const problem = accessTokenProblem(`curl-X POST"https://graph.facebook.com/v26.0/123/events"-d'{"data":[]}'`);

    expect(problem).not.toBeNull();
    expect(problem).toContain('letters');
  });

  it('rejects a pasted JSON snippet', () => {
    expect(accessTokenProblem('{"access_token":"EAAabc..."}')).not.toBeNull();
  });

  it('accepts an app access token, which Meta writes as id|secret', () => {
    expect(accessTokenProblem(`${'1'.repeat(16)}|${'a'.repeat(32)}`)).toBeNull();
  });

  it('says a blank token is missing rather than malformed', () => {
    expect(accessTokenProblem('')).toMatch(/missing|empty/i);
  });
});

// Graph echoes the token back inside some of its errors — verified against the
// live API: a bad token answers 400 with
// {"error":{"message":"Malformed access token EAAfake...","code":190}}.
// That message is shown in the UI and written to the log, so the credential has
// to come out of it first.
describe('redactToken', () => {
  const token = 'EAA' + 'Qwerty1234_-'.repeat(18);

  it('takes the token out of a message Meta echoed it into', () => {
    const redacted = redactToken(`Malformed access token ${token}`, token);

    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[token]');
    expect(redacted).toContain('Malformed access token');
  });

  it('also masks a token-shaped blob it does not recognise', () => {
    const other = 'EAAG' + 'x'.repeat(40);

    expect(redactToken(`Error validating ${other}`, token)).not.toContain(other);
  });

  it('leaves an ordinary message untouched', () => {
    expect(redactToken('Session has expired on Tuesday, 21-Oct-26 10:00:00 PDT', token)).toBe(
      'Session has expired on Tuesday, 21-Oct-26 10:00:00 PDT',
    );
  });

  it('copes with no token to redact', () => {
    expect(redactToken('Bad signature', '')).toBe('Bad signature');
  });

  it('keeps the message to a length that fits in the UI', () => {
    expect(redactToken('x '.repeat(400), token).length).toBeLessThanOrEqual(300);
  });
});
