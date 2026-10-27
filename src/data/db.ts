import fs from "node:fs";
import path from "node:path";

/**
 * Minimal SQL interface shared by production (Supabase Postgres via postgres.js)
 * and local/demo/test (embedded PGlite + PostGIS running the same migrations).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs fn in a transaction. With `asUser`, RLS applies exactly like a Supabase API request. */
  tx<T>(fn: (db: Db) => Promise<T>, opts?: { asUser?: string }): Promise<T>;
  kind: "postgres" | "pglite";
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Stand-ins for the parts of Supabase that exist outside plain Postgres (auth schema, API roles). */
export const SUPABASE_SHIM = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
`;

const GRANTS = `
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
`;

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

let pgliteSingleton: Promise<Db> | null = null;

/** Embedded Postgres + PostGIS with all migrations applied. `dataDir` undefined = in-memory. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { postgis } = await import("@electric-sql/pglite-postgis");
  const fresh = !dataDir || !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = await PGlite.create({ dataDir, extensions: { postgis } });
  if (fresh) {
    await pg.exec(SUPABASE_SHIM);
    // Supabase grants table privileges to the API roles by default; mirror that BEFORE the
    // RLS migration so its revokes take effect.
    for (const f of migrationFiles()) {
      if (f.includes("_rls")) await pg.exec(GRANTS);
      await pg.exec(fs.readFileSync(f, "utf8"));
    }
    await pg.exec(`grant select on public_events to anon, authenticated;`);
  } else {
    // Existing local database: re-apply the idempotent seed so new sources and venues appear.
    const seed = migrationFiles().find((f) => f.endsWith("_seed.sql"));
    if (seed) await pg.exec(fs.readFileSync(seed, "utf8"));
  }

  const wrap = (exec: { query: typeof pg.query }): Db => ({
    kind: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await exec.query<T>(sql, params as never[]);
      return r.rows;
    },
    async tx<T>(fn: (db: Db) => Promise<T>, opts?: { asUser?: string }) {
      return pg.transaction(async (t) => {
        if (opts?.asUser) {
          await t.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opts.asUser]);
          await t.query(`set local role authenticated`);
        }
        return fn(wrap(t as unknown as { query: typeof pg.query }));
      }) as Promise<T>;
    },
  });
  return wrap(pg);
}

let pgSingleton: Promise<Db> | null = null;

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, ssl: url.includes("localhost") ? false : "require" });
  const wrap = (s: import("postgres").Sql | import("postgres").TransactionSql): Db => ({
    kind: "postgres",
    async query<T>(text: string, params: unknown[] = []) {
      return (await s.unsafe(text, params as never[])) as unknown as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>, opts?: { asUser?: string }) {
      return sql.begin(async (t) => {
        if (opts?.asUser) {
          await t.unsafe(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [
            opts.asUser,
            JSON.stringify({ sub: opts.asUser, role: "authenticated" }),
          ]);
          await t.unsafe(`set local role authenticated`);
        }
        return fn(wrap(t));
      }) as Promise<T>;
    },
  });
  return wrap(sql);
}

/** The app's database: Supabase when DATABASE_URL is set, otherwise the embedded demo database. */
export async function getDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    pgSingleton ??= createPostgresDb(process.env.DATABASE_URL);
    return pgSingleton;
  }
  if (!pgliteSingleton) {
    pgliteSingleton = (async () => {
      const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? undefined : path.join(process.cwd(), ".data", "pglite"));
      if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
      const db = await createPgliteDb(dir);
      const { ensureDemoData } = await import("./demo");
      await ensureDemoData(db);
      return db;
    })();
  }
  return pgliteSingleton;
}

export const usingEmbeddedDb = () => !process.env.DATABASE_URL;
