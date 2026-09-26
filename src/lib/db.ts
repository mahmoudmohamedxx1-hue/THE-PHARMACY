import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * The SQLite catalog lives at <project>/db/custom.db (committed to the repo).
 * Prisma resolves relative `file:` URLs against the process CWD, which breaks
 * in `output: standalone` mode (the server runs from .next/standalone) and in
 * serverless bundles. Probe a few well-known locations and pass an absolute
 * URL via the runtime `datasources` override so every launch mode works:
 * project root, .next/standalone (db copied in by the build script), one or
 * two levels below the root, or derived from the server.js location.
 * An explicit DATABASE_URL from the environment always wins.
 *
 * Serverless (Vercel) note: the function bundle filesystem is READ-ONLY.
 * The committed catalog is bundled via `outputFileTracingIncludes`, then
 * copied to /tmp on cold start so SQLite can create its journal files and
 * accept writes (orders, analytics, prescriptions). That copy is per-instance
 * and resets on cold start — fine for demo deployments. For durable data set
 * DATABASE_URL to a hosted database (Neon/Supabase/Turso) in the Vercel
 * project settings; this resolver never runs in that case.
 */
function findBundledDb(): string | null {
  const cwd = process.cwd();
  const argv1 = process.argv[1] ?? "";
  const serverDir = path.dirname(path.resolve(argv1));
  const candidates = [
    path.join(cwd, "db", "custom.db"), // launched from project root
    path.join(cwd, "..", "db", "custom.db"), // launched one level below root
    path.join(cwd, "..", "..", "db", "custom.db"), // launched from .next/standalone
    path.join(serverDir, "..", "..", "db", "custom.db"), // derived from server.js location
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

const SERVERLESS_COPY_FLAG = "__tp_serverless_db_path__";

/** Copy the bundled read-only catalog to a writable temp location once per
 *  instance so SQLite can open it read-write on serverless platforms. */
function serverlessDbUrl(): string {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g[SERVERLESS_COPY_FLAG] === "string") {
    return `file:${g[SERVERLESS_COPY_FLAG]}`;
  }
  const src = findBundledDb();
  if (!src) {
    // Nothing bundled — fall through to the default path so Prisma raises a
    // clear error instead of us inventing one.
    return `file:${path.join(process.cwd(), "db", "custom.db")}`;
  }
  try {
    const dest = path.join(os.tmpdir(), "tp-custom.db");
    fs.copyFileSync(src, dest);
    g[SERVERLESS_COPY_FLAG] = dest;
    console.log(`[db] serverless mode: copied catalog ${src} -> ${dest} (per-instance, demo persistence)`);
    return `file:${dest}`;
  } catch {
    // Copy failed (read-only /tmp?) — serve reads from the bundle directly.
    // The committed DB uses journal_mode=delete so read-only opens work.
    return `file:${src}`;
  }
}

function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    if (url.startsWith("file:")) {
      const p = url.slice("file:".length);
      try {
        if (fs.existsSync(p)) return url; // valid absolute/relative path
      } catch {}
      // A stale absolute path from another machine (e.g. copied .env from the
      // sandbox) would break the serverless deployment — fall back to the
      // bundled catalog instead of erroring on every request.
      if (process.env.VERCEL || process.env.VERCEL_ENV) {
        console.warn(`[db] DATABASE_URL "${url}" not found on this deployment — using bundled catalog copy`);
        return serverlessDbUrl();
      }
    }
    return url; // hosted DB (postgres:/...) or a local file path — trust it
  }
  if (process.env.VERCEL || process.env.VERCEL_ENV) return serverlessDbUrl();
  const found = findBundledDb();
  return `file:${found ?? path.join(process.cwd(), "db", "custom.db")}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDbUrl() } },
    // Keep logging minimal — query logging floods dev.log and slows the
    // dev server down with the tee pipeline.
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
