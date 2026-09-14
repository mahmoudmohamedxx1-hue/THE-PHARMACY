import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { zoneById, FREE_DELIVERY_THRESHOLD } from '@/lib/zones'

interface CartItemInput { productId: string; quantity: number }

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    const body = await req.json()
    const { items, zone, address, phone, notes } = body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'empty_cart' }, { status: 400 })
    }
    const zoneInfo = zoneById(String(zone || ''))
    if (!zoneInfo) return NextResponse.json({ error: 'invalid_zone' }, { status: 400 })
    if (!address || String(address).trim().length < 8) {
      return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
    }
    if (!/^(\+?2?01)[0-9]{9}$/.test(String(phone || '').replace(/[\s-]/g, ''))) {
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
      const qty = Math.max(1, Math.min(20, Number(it.quantity) || 1))
      if (p.stock < qty) {
        return NextResponse.json({ error: 'out_of_stock', name: p.nameEn, available: p.stock }, { status: 409 })
      }
      orderItems.push({ productId: p.id, nameEn: p.nameEn, nameAr: p.nameAr, price: p.price, quantity: qty })
      subtotal += p.price * qty
    }

    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : zoneInfo.fee
    const total = Math.round((subtotal + deliveryFee) * 100) / 100
    const orderNumber = `TP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 9000 + 1000)}`

    const order = await db.order.create({
      data: {
        orderNumber, userId: user?.id || null,
        status: 'pending',
        subtotal: Math.round(subtotal * 100) / 100, deliveryFee, total,
        paymentMethod: 'cod', zone: zoneInfo.id,
        address: String(address).trim(), phone: String(phone).trim(),
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
