# Expo + Supabase: a daily limit the client cannot bypass

[![CI](https://github.com/techsavvysenior/expo-supabase-connections/actions/workflows/ci.yml/badge.svg)](https://github.com/techsavvysenior/expo-supabase-connections/actions/workflows/ci.yml)

A small React Native app where people send each other connection requests. Free
accounts get five requests per rolling 24 hours.

The interesting part is where that rule lives. The limit, the ownership checks
and the "who can see what" rules are all enforced inside Postgres, so they hold
even if someone skips the app and calls the Supabase API directly with their own
token. The app is a thin, typed client on top.

## What it shows

**Database (`supabase/migrations`)**

- **Writes only through functions.** `connection_requests` has no insert or
  update policy. Requests are created by `send_connection_request()` and answered
  by `respond_to_connection_request()`, so the limit cannot be skipped.
- **Row-level security.** A request is visible to its sender and its recipient
  and to nobody else.
- **Column-level grants.** Other people's `plan` is not readable, and a user
  cannot change their own plan.
- **A race-safe limit.** The function takes a per-sender advisory lock before
  counting, so two requests sent at the same instant cannot both pass.
- **Stable error codes.** Functions raise codes such as `LIMIT_REACHED` and
  `ALREADY_REQUESTED`. The app maps them to text in one place.
- **Hardened functions.** Each `security definer` function sets an empty
  `search_path`, and execute rights are revoked from `anon`.

**App (`src`)**

- **Expo Router with guarded routes.** `Stack.Protected` decides which screens
  exist for the current session. Nothing navigates by hand after sign-in.
- **One closed set of errors.** `toAppError` turns Postgres, auth and network
  failures into a single `AppError` type. The message switch has no default
  branch, so a new error kind fails the type check until it has a message.
- **TanStack Query** for server state. Reads retry only when offline, writes are
  never retried, and cached data is cleared on sign-out.
- **Session in the Keychain or Keystore.** A Supabase session is larger than one
  secure-store entry allows, so `chunked-storage.ts` splits it across entries.
- **Strict TypeScript** throughout, with database types in `src/types/database.ts`.

## Tests

```bash
npm run check   # type check, lint, unit tests, database tests
```

| Suite | What it runs | Count |
|---|---|---|
| `npm run test:db` | The real migration against Postgres running in process ([PGlite](https://pglite.dev)), acting as different users | 26 |
| `npm test` | Error mapping, secure storage, relationship and quota logic | 40 |

The database tests sign users up, switch to the `authenticated` role with that
user's id in the JWT claim, and then try the things a hostile client would try:
inserting a request directly, reading another user's plan, upgrading their own
plan, accepting their own request, answering someone else's.

CI also type checks, lints and builds the iOS and Android bundles on every push.

One thing the tests do not cover: PGlite runs a single connection, so the
advisory lock is not exercised under real concurrency.

## Run it

Requires Node 22.18 or later.

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/migrations/20261119000000_connections.sql`.
   With the Supabase CLI, `supabase db push` does the same.
3. For a quick local trial, turn off "Confirm email" under Authentication,
   Sign In / Providers, Email.
4. Copy `.env.example` to `.env` and fill in the project URL and publishable key.
5. Start the app:

```bash
npm install
npx expo start
```

Create two accounts on two simulators to send and accept requests. To try the
higher limit, set `plan = 'pro'` on a profile from the SQL editor.

## Layout

```
supabase/
  migrations/            schema, policies, grants, functions
  tests/                 database tests and the Postgres harness
src/
  app/                   screens (Expo Router)
  features/auth/         session provider
  features/connections/  API calls, query hooks, pure model logic
  lib/                   Supabase client, errors, secure storage
  types/                 database types
```
