import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('uses the message the API sent', () => {
    const err = { response: { data: { message: 'Meta rejected this access token: Bad signature.' } } };

    expect(apiErrorMessage(err, 'fallback')).toBe('Meta rejected this access token: Bad signature.');
  });

  // NestJS's ValidationPipe answers with an ARRAY of messages. Rendered as-is
  // those run together with no spaces ("Dataset ID is required.enabled must
  // be a boolean"), which is how a validation failure turns into gibberish.
  it('joins the list of messages a validation failure returns', () => {
    const err = {
      response: { data: { message: ['Dataset ID is required.', 'enabled must be a boolean value'] } },
    };

    expect(apiErrorMessage(err, 'fallback')).toBe(
      'Dataset ID is required. enabled must be a boolean value',
    );
  });

  it('skips blank entries in that list', () => {
    const err = { response: { data: { message: ['Dataset ID is required.', '', '  '] } } };

    expect(apiErrorMessage(err, 'fallback')).toBe('Dataset ID is required.');
  });

  it('falls back when the API said nothing useful', () => {
    expect(apiErrorMessage({ response: { data: {} } }, 'Could not save.')).toBe('Could not save.');
    expect(apiErrorMessage(new Error('Network Error'), 'Could not save.')).toBe('Could not save.');
    expect(apiErrorMessage(undefined, 'Could not save.')).toBe('Could not save.');
  });

  it('falls back when the message is an empty list', () => {
    expect(apiErrorMessage({ response: { data: { message: [] } } }, 'Could not save.')).toBe('Could not save.');
  });
});
