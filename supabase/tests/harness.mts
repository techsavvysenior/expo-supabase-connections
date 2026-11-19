import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite, type Transaction } from '@electric-sql/pglite';

/**
 * A real Postgres engine running in-process, so the policies and functions
 * are tested as SQL and not as mocks.
 *
 * Supabase provides the `auth` schema, the `anon` and `authenticated` roles,
 * and broad default grants. This recreates just enough of that for the
 * migrations to run unchanged.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public
    grant all on tables to anon, authenticated;
`;

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

/** Signs a user up the way Supabase Auth would, and returns their id. */
export async function signUp(
  db: PGlite,
  email: string,
  displayName?: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [email, displayName ? { display_name: displayName } : {}],
  );
  return rows[0].id;
}

/**
 * Runs `work` exactly as a signed-in user would reach the database through
 * the API: as the `authenticated` role, with their id in the JWT claim.
 */
export function asUser<T>(
  db: PGlite,
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return work(tx);
  }) as Promise<T>;
}

/** The same, for a visitor who is not signed in. */
export function asAnonymous<T>(
  db: PGlite,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    return work(tx);
  }) as Promise<T>;
}
