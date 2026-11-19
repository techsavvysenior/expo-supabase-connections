import { AppError, describeError, isRetryable, toAppError, type AppErrorKind } from '@/lib/errors';

describe('toAppError', () => {
  it.each<[string, AppErrorKind]>([
    ['LIMIT_REACHED', 'limit_reached'],
    ['ALREADY_REQUESTED', 'already_requested'],
    ['CANNOT_CONNECT_TO_SELF', 'cannot_connect_to_self'],
    ['RECIPIENT_NOT_FOUND', 'recipient_not_found'],
    ['REQUEST_NOT_FOUND', 'request_not_found'],
    ['NOT_AUTHENTICATED', 'not_authenticated'],
  ])('maps the database code %s', (message, kind) => {
    const error = toAppError({ code: 'P0001', message, details: null, hint: null });
    expect(error.kind).toBe(kind);
  });

  it('keeps the server detail for logs', () => {
    const error = toAppError({
      code: 'P0001',
      message: 'LIMIT_REACHED',
      details: '5 of 5 requests used in the last 24 hours.',
    });
    expect(error.detail).toBe('5 of 5 requests used in the last 24 hours.');
  });

  it.each<[string, AppErrorKind]>([
    ['invalid_credentials', 'invalid_credentials'],
    ['user_already_exists', 'email_taken'],
    ['weak_password', 'weak_password'],
    ['refresh_token_not_found', 'not_authenticated'],
  ])('maps the auth code %s', (code, kind) => {
    expect(toAppError({ name: 'AuthApiError', code, message: 'x', status: 400 }).kind).toBe(kind);
  });

  it('treats an expired JWT as signed out', () => {
    expect(toAppError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('not_authenticated');
  });

  it.each([
    [{ message: 'TypeError: Network request failed' }],
    [{ name: 'AuthRetryableFetchError', message: '' }],
    [new TypeError('Failed to fetch')],
  ])('treats a failed request as offline', (failure) => {
    expect(toAppError(failure).kind).toBe('offline');
  });

  it('falls back to unknown and keeps the original as the cause', () => {
    const original = { code: '42501', message: 'permission denied for table profiles' };
    const error = toAppError(original);

    expect(error.kind).toBe('unknown');
    expect(error.cause).toBe(original);
  });

  it.each([[null], [undefined], ['boom'], [42]])('copes with a thrown %p', (thrown) => {
    expect(toAppError(thrown).kind).toBe('unknown');
  });

  it('returns an AppError unchanged', () => {
    const error = new AppError('limit_reached');
    expect(toAppError(error)).toBe(error);
  });
});

describe('describeError', () => {
  it('never shows a raw server message to the user', () => {
    const error = toAppError({ code: '42501', message: 'permission denied for table profiles' });
    expect(describeError(error)).toBe('Something went wrong. Please try again.');
  });

  it('explains the daily limit in plain words', () => {
    expect(describeError(new AppError('limit_reached'))).toMatch(/today's connection requests/);
  });
});

describe('isRetryable', () => {
  it('offers a retry only where trying again can help', () => {
    expect(isRetryable(new AppError('offline'))).toBe(true);
    expect(isRetryable(new AppError('unknown'))).toBe(true);
    expect(isRetryable(new AppError('limit_reached'))).toBe(false);
    expect(isRetryable(new AppError('invalid_credentials'))).toBe(false);
  });
});
