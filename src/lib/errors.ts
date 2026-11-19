/**
 * Every failure the app shows to a user, as one closed set.
 *
 * Supabase reports problems in several shapes (Postgres errors, auth errors,
 * failed fetches). `toAppError` is the only place that knows about those
 * shapes. Screens only ever see an `AppError`.
 */
export type AppErrorKind =
  | 'offline'
  | 'not_authenticated'
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'limit_reached'
  | 'already_requested'
  | 'cannot_connect_to_self'
  | 'recipient_not_found'
  | 'request_not_found'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Extra context from the server, for logs. Never shown to the user. */
  readonly detail?: string;

  constructor(kind: AppErrorKind, options: { detail?: string; cause?: unknown } = {}) {
    super(kind, { cause: options.cause });
    this.name = 'AppError';
    this.kind = kind;
    this.detail = options.detail;
  }
}

/** Codes raised by the functions in `supabase/migrations`. */
const DATABASE_CODES: Record<string, AppErrorKind> = {
  NOT_AUTHENTICATED: 'not_authenticated',
  LIMIT_REACHED: 'limit_reached',
  ALREADY_REQUESTED: 'already_requested',
  CANNOT_CONNECT_TO_SELF: 'cannot_connect_to_self',
  RECIPIENT_NOT_FOUND: 'recipient_not_found',
  REQUEST_NOT_FOUND: 'request_not_found',
};

/** Codes returned by Supabase Auth. */
const AUTH_CODES: Record<string, AppErrorKind> = {
  invalid_credentials: 'invalid_credentials',
  user_already_exists: 'email_taken',
  email_exists: 'email_taken',
  weak_password: 'weak_password',
  session_not_found: 'not_authenticated',
  refresh_token_not_found: 'not_authenticated',
};

const NETWORK_FAILURE = /network request failed|failed to fetch|fetch failed|network error/i;

function field(error: unknown, name: string): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = field(error, 'message') ?? '';
  const code = field(error, 'code') ?? '';
  const name = field(error, 'name') ?? '';
  const detail = field(error, 'details') ?? field(error, 'detail');

  const fromDatabase = DATABASE_CODES[message];
  if (fromDatabase) return new AppError(fromDatabase, { detail, cause: error });

  const fromAuth = AUTH_CODES[code];
  if (fromAuth) return new AppError(fromAuth, { cause: error });

  // PostgREST answers an expired or missing JWT with these.
  if (code === 'PGRST301' || code === 'PGRST302') {
    return new AppError('not_authenticated', { cause: error });
  }

  if (name === 'AuthRetryableFetchError' || NETWORK_FAILURE.test(message)) {
    return new AppError('offline', { cause: error });
  }

  return new AppError('unknown', { detail: message || undefined, cause: error });
}

/**
 * The text a user sees. The switch has no default branch, so adding a new
 * `AppErrorKind` fails the type check until it has a message here.
 */
export function describeError(error: AppError): string {
  switch (error.kind) {
    case 'offline':
      return "You're offline. Check your connection and try again.";
    case 'not_authenticated':
      return 'Your session has ended. Please sign in again.';
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_taken':
      return 'An account with this email already exists.';
    case 'weak_password':
      return 'Choose a stronger password.';
    case 'limit_reached':
      return "You've used all of today's connection requests.";
    case 'already_requested':
      return 'There is already a request between you and this person.';
    case 'cannot_connect_to_self':
      return "You can't send a request to yourself.";
    case 'recipient_not_found':
      return 'This person is no longer available.';
    case 'request_not_found':
      return 'This request has already been answered.';
    case 'unknown':
      return 'Something went wrong. Please try again.';
  }
}

/** Whether a "Try again" button makes sense for this failure. */
export function isRetryable(error: AppError): boolean {
  return error.kind === 'offline' || error.kind === 'unknown';
}
