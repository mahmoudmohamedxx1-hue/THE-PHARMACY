import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { scryptSync, randomBytes, timingSafeEqual, randomUUID, createHmac } from 'crypto'

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const derived = scryptSync(password, salt, 64)
    return timingSafeEqual(Buffer.from(hash, 'hex'), derived)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Stateless signed session tokens (v1.<userId>.<expMs>.<hmac>)        */
/* ------------------------------------------------------------------ */
/* The database lives in the deployment bundle, so on serverless the    */
/* Session table is ephemeral: a login that lands on instance A is     */
/* invisible on instance B -> "random" logouts. Signed HMAC tokens     */
/* verify locally on any instance of the same deployment. Set          */
/* SESSION_SECRET in the hosting env for stable tokens across deploys. */

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    // Same value on every instance of this deployment -> shared key.
    // Not published anywhere (distinct from the public commit SHA).
    process.env.VERCEL_DEPLOYMENT_ID ||
    'tp-local-dev-secret' // local/dev fallback only
  )
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

export function signSessionToken(userId: string, expiresMs: number): string {
  const payload = `v1.${userId}.${expiresMs}`
  const mac = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  return `${payload}.${mac}`
}

export function verifySessionToken(token: string): { userId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  const [, userId, expStr, mac] = parts
  const expiresMs = Number(expStr)
  if (!userId || !Number.isFinite(expiresMs) || !mac) return null
  if (Date.now() > expiresMs) return null
  const expected = createHmac('sha256', sessionSecret()).update(`v1.${userId}.${expStr}`).digest('hex')
  const a = Buffer.from(mac, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { userId }
}

/** Purge expired sessions so the table cannot grow unbounded.
 *  Called on every login + occasionally on session reads. */
export async function purgeExpiredSessions(): Promise<number> {
  try {
    const res = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    return res.count
  } catch {
    return 0
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  // Primary: stateless signed token — verifiable on every serverless
  // instance, immune to the ephemeral Session-table split-brain.
  const signed = signSessionToken(userId, expiresAt.getTime())
  // Best-effort mirror row for the legacy lookup path + local dev tooling;
  // a failed write (read-only FS, etc.) must not break login.
  try {
    const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
    await db.session.create({ data: { token, userId, expiresAt } })
  } catch { /* stateless token already carries the session */ }
  const jar = await cookies()
  jar.set('tp_session', signed, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt,
    // Send the cookie over HTTPS only in production (Vercel / custom domain).
    secure: process.env.NODE_ENV === 'production',
  })
  // housekeeping: drop expired sessions on every login
  purgeExpiredSessions()
  return signed
}

export async function destroySession() {
  const jar = await cookies()
  const token = jar.get('tp_session')?.value
  if (token) {
    // signed tokens are stateless -> clearing the cookie ends them; legacy
    // tokens need the DB row gone too.
    try { await db.session.deleteMany({ where: { token } }) } catch { /* ephemeral FS */ }
  }
  jar.delete('tp_session')
}

export async function getCurrentUser() {
  const jar = await cookies()
  const token = jar.get('tp_session')?.value
  if (!token) return null

  // v1 signed token: verify locally, then confirm the user still exists.
  if (token.startsWith('v1.')) {
    const parsed = verifySessionToken(token)
    if (!parsed) return null
    return db.user.findUnique({ where: { id: parsed.userId } })
  }

  // Legacy random token (created before signed sessions): DB lookup.
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    // lazily delete the expired session so it cannot be replayed
    db.session.deleteMany({ where: { token } }).catch(() => {})
    return null
  }
  // opportunistic full cleanup on ~2% of authenticated requests
  if (Math.random() < 0.02) purgeExpiredSessions()
  return session.user
}
