// DB hygiene — run before every build / server start.
//
// Why: the z.ai sandbox occasionally restores the repo from a tar snapshot
// while leaving a stale SQLite -wal/-shm pair behind. Opening the db in that
// state can report "database disk image is malformed" and breaks the Next.js
// prerender. This script:
//   1. checkpoints + truncates any WAL journal (and removes -shm)
//   2. runs PRAGMA integrity_check
//   3. if the catalog is corrupt, restores it from the git HEAD blob (the
//      committed pristine catalog) — keeping the site bootable
// It is a safe no-op when everything is healthy, and a no-op on Vercel
// (read-only bundle fs; the /tmp copy in db.ts is always fresh anyway).
import { Database } from "bun:sqlite";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB = path.join(process.cwd(), "db", "custom.db");
const WAL = DB + "-wal";
const SHM = DB + "-shm";

if (!fs.existsSync(DB)) {
  console.log("[db-hygiene] no db/custom.db (skipped)");
  process.exit(0);
}

function walCheckpoint() {
  if (!fs.existsSync(WAL)) return;
  try {
    const db = new Database(DB);
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    console.log("[db-hygiene] WAL checkpointed + truncated");
  } catch (e) {
    console.warn("[db-hygiene] WAL checkpoint failed:", String(e).slice(0, 120));
  }
  try { fs.rmSync(SHM, { force: true }); } catch {}
  try { if (fs.existsSync(WAL) && fs.statSync(WAL).size === 0) fs.rmSync(WAL, { force: true }); } catch {}
}

function integrityOk() {
  try {
    const db = new Database(DB, { readonly: true });
    const row = db.query("PRAGMA integrity_check").get();
    db.close();
    return Object.values(row)[0] === "ok";
  } catch {
    return false;
  }
}

function restoreFromGit() {
  try {
    const blob = execSync("git show HEAD:db/custom.db", { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(DB, blob);
    fs.rmSync(WAL, { force: true });
    fs.rmSync(SHM, { force: true });
    console.log("[db-hygiene] corrupt catalog restored from git HEAD (" + blob.length + " bytes)");
    return true;
  } catch (e) {
    console.error("[db-hygiene] git restore failed:", String(e).slice(0, 160));
    return false;
  }
}

walCheckpoint();

if (integrityOk()) {
  console.log("[db-hygiene] integrity ok");
} else {
  console.warn("[db-hygiene] catalog CORRUPT — restoring from git HEAD");
  if (!restoreFromGit() || !integrityOk()) {
    console.error("[db-hygiene] catalog still unhealthy after restore");
    process.exit(1);
  }
}
