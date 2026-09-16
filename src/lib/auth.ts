import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'crypto'

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
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days
  await db.session.create({ data: { token, userId, expiresAt } })
  const jar = await cookies()
  jar.set('tp_session', token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt,
    // Send the cookie over HTTPS only in production (Vercel / custom domain).
    secure: process.env.NODE_ENV === 'production',
  })
  // housekeeping: drop expired sessions on every login
  purgeExpiredSessions()
  return token
}

export async function destroySession() {
  const jar = await cookies()
  const token = jar.get('tp_session')?.value
  if (token) await db.session.deleteMany({ where: { token } })
  jar.delete('tp_session')
}

export async function getCurrentUser() {
  const jar = await cookies()
  const token = jar.get('tp_session')?.value
  if (!token) return null
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
