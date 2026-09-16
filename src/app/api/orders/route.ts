import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { zoneById } from '@/lib/zones'
import {
  clampQty, computeDeliveryFee, generateOrderNumber, isValidAddress,
  isValidEgyptPhone, normalizePhone, round2,
} from '@/lib/order-utils'
import { sendOrderConfirmation } from '@/lib/notify'
import { recordEvent } from '@/lib/analytics-server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

interface CartItemInput { productId: string; quantity: number }

export async function POST(req: NextRequest) {
  try {
    // spam guard: 10 order attempts / minute / IP
    if (!rateLimit(`order:${clientIp(req)}`, 10, 60_000)) {
      return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    const user = await getCurrentUser()
    const body = await req.json()
    const { items, zone, address, phone, notes } = body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'empty_cart' }, { status: 400 })
    }
    const zoneInfo = zoneById(String(zone || ''))
    if (!zoneInfo) return NextResponse.json({ error: 'invalid_zone' }, { status: 400 })
    if (!isValidAddress(address)) {
      return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
    }
    if (!isValidEgyptPhone(phone)) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    }

    // validate products + stock
    const ids = items.map((i: CartItemInput) => String(i.productId)).filter(Boolean)
    const products = await db.product.findMany({ where: { id: { in: ids } } })
    const pmap = new Map(products.map((p) => [p.id, p]))

    const orderItems: { productId: string; nameEn: string; nameAr: string; price: number; quantity: number }[] = []
    let subtotal = 0
    for (const it of items as CartItemInput[]) {
      const p = pmap.get(String(it.productId))
      if (!p) return NextResponse.json({ error: 'product_not_found' }, { status: 400 })
      const qty = clampQty(it.quantity)
      if (p.stock < qty) {
        return NextResponse.json({ error: 'out_of_stock', name: p.nameEn, available: p.stock }, { status: 409 })
      }
      orderItems.push({ productId: p.id, nameEn: p.nameEn, nameAr: p.nameAr, price: p.price, quantity: qty })
      subtotal += p.price * qty
    }

    const deliveryFee = computeDeliveryFee(subtotal, zoneInfo)
    const total = round2(subtotal + deliveryFee)
    const orderNumber = generateOrderNumber()

    const order = await db.order.create({
      data: {
        orderNumber, userId: user?.id || null,
        status: 'pending',
        subtotal: round2(subtotal), deliveryFee, total,
        paymentMethod: 'cod', zone: zoneInfo.id,
        address: String(address).trim(), phone: normalizePhone(phone),
        notes: String(notes || '').trim() || null,
        items: { create: orderItems },
      },
      include: { items: true },
    })

    // decrement stock
    for (const it of orderItems) {
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.quantity } },
      })
    }

    // first-party purchase event (reliable, server-side truth)
    recordEvent({
      type: 'purchase',
      path: '/checkout',
      sessionId: null,
      meta: { value: total, orderId: order.orderNumber, userId: user?.id || null },
    })

    // order confirmation email (no-op without RESEND_API_KEY)
    sendOrderConfirmation(order, user?.email).catch(() => {})

    return NextResponse.json({ order })
  } catch (e) {
    console.error('order error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ orders: [] })
    const orders = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: { select: { imageUrl: true, slug: true } } } } },
    })
    return NextResponse.json({ orders })
  } catch (e) {
    console.error('orders error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
