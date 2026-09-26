// Checkpoint WAL into main db file and switch journal_mode to DELETE
// so the committed SQLite catalog is openable read-only on serverless (Vercel).
// Run while the app server is STOPPED (no other connections).
const DB_PATH = "/home/z/my-project/db/custom.db";
const { Database } = require("bun:sqlite");

async function main() {
  const fs = require("node:fs");

  // 1. Open writable and checkpoint (merges WAL contents into main file)
  const db = new Database(DB_PATH);
  console.log("mode before:", JSON.stringify(db.query("PRAGMA journal_mode").get()));

  const cp = db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
  console.log("checkpoint:", JSON.stringify(cp));

  // 2. Flip journal mode (requires no other writers; server must be stopped)
  const sw = db.query("PRAGMA journal_mode=DELETE").get();
  console.log("switch result:", JSON.stringify(sw));

  // 3. Verify counts + integrity
  console.log("products:", db.query("SELECT COUNT(*) c FROM Product").get().c);
  console.log("users:", db.query("SELECT COUNT(*) c FROM User").get().c);
  console.log("events:", db.query("SELECT COUNT(*) c FROM AnalyticsEvent").get().c);
  console.log("integrity:", JSON.stringify(db.query("PRAGMA integrity_check").get()));
  db.close();

  // 4. Remove stale WAL sidecars (safe: checkpoint TRUNCATE already merged them)
  for (const f of ["custom.db-wal", "custom.db-shm"]) {
    const p = "/home/z/my-project/db/" + f;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log("removed", f);
    }
  }

  // 5. Final verification with a fresh read-only handle
  const ro = new Database(DB_PATH, { readonly: true });
  console.log("final mode:", JSON.stringify(ro.query("PRAGMA journal_mode").get()));
  ro.close();
}

main();
