import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    // Brute-force protection: max 8 attempts per email and 30 per IP in any
    // 5-minute window (successful logins count too — 8/5min is generous for
    // real users while making credential stuffing impractical).
    const ip = clientIp(req)
    const { email, password } = await req.json()
    const cleanEmail = String(email || '').trim().toLowerCase()

    const emailOk = rateLimit(`login:email:${cleanEmail}`, 8, 5 * 60_000)
    const ipOk = rateLimit(`login:ip:${ip}`, 30, 5 * 60_000)
    if (!emailOk || !ipOk) {
      return NextResponse.json(
        { error: 'too_many_attempts', retryAfterSec: 300 },
        { status: 429, headers: { 'Retry-After': '300' } }
      )
    }

    const user = await db.user.findUnique({ where: { email: cleanEmail } })
    if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    await createSession(user.id)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, isAdmin: user.isAdmin },
    })
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
