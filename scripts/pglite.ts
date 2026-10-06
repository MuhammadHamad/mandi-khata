/**
 * Runs supabase/setup.sql in an in-process Postgres (PGlite), so the
 * database rules can be checked without a Supabase project. Adapted from the
 * Arabian Musk app's harness.
 *
 * PGlite 0.3 is Postgres 17, the version Supabase runs; keep the two in step.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SETUP_SQL = readFileSync(join(process.cwd(), 'supabase', 'setup.sql'), 'utf8')

export async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create()

  // What Supabase provides and setup.sql leans on: the anon/authenticated
  // roles, auth.users, and auth.uid() reading the signed-in user. Here
  // auth.uid() reads a setting the checks set directly.
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    end $$;

    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `)
  await db.exec(SETUP_SQL)
  return db
}

export async function addUser(db: PGlite, id: string, email: string): Promise<void> {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
}

/** Runs `fn` as a signed-in user (or anon), with row-level security in force. */
export async function as<T>(
  db: PGlite,
  uid: string | null,
  fn: () => Promise<T>,
  role: 'authenticated' | 'anon' = 'authenticated',
): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ''}'; set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub;')
  }
}
