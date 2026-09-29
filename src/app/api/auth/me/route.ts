import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { isEphemeralDb } from '@/lib/runtime'

export async function GET() {
  const user = await getCurrentUser()
  // Surfaced in the admin UI: writes on this deployment are ephemeral.
  const dbEphemeral = isEphemeralDb()
  if (!user) return NextResponse.json({ user: null, dbEphemeral })
  return NextResponse.json({
    dbEphemeral,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      isAdmin: user.isAdmin,
      // Real registration date — powers the honest "Member since" display.
      createdAt: user.createdAt,
    },
  })
}
