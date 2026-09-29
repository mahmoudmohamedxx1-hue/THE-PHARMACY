/**
 * Runtime deployment-mode detection.
 *
 * The catalog ships as a bundled SQLite file, which works perfectly for the
 * read-heavy storefront. On serverless hosting (Vercel) that file lives on an
 * ephemeral per-instance filesystem: WRITES (orders, sessions, analytics)
 * succeed on one instance but vanish when it recycles or the site redeploys.
 * This flag lets the UI surface that honestly instead of failing silently.
 */
export function isEphemeralDb(): boolean {
  if (!process.env.VERCEL) return false // local/dev: the file on disk persists
  const url = process.env.DATABASE_URL || ''
  // Unset -> bundled SQLite default; file: -> local SQLite file. Both are
  // ephemeral on serverless. A postgres://… / mysql://… URL is durable.
  return !url || url.startsWith('file:')
}
