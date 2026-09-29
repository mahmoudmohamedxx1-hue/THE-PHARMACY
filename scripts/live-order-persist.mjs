#!/usr/bin/env node
/**
 * LIVE order-persistence probe on Vercel.
 * 1. Place a guest COD order via /api/orders
 * 2. Re-check stock + verify order visibility (admin stats) immediately
 * 3. Re-check again later (idle wait) to observe ephemeral-FS behavior
 * Usage: node scripts/live-order-persist.mjs place|check
 */
const BASE = 'https://the-pharmacy-two.vercel.app'
const PID = 'cmu0diguf00dtgeaftcrrg8fr' // shan hand cream, stock 203

const place = async () => {
  const r = await fetch(BASE + '/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: PID, quantity: 1 }],
      zone: 'nasr-city',
      address: '12 Abbas El Akkad St, Apt 7, Nasr City, Cairo',
      phone: '01012345678',
      notes: 'PERSISTENCE PROBE — safe to delete',
    }),
  })
  const j = await r.json().catch(() => ({}))
  console.log('PLACE status', r.status, 'orderNumber', j?.order?.orderNumber, 'total', j?.order?.total, 'deliveryFee', j?.order?.deliveryFee)
  const before = await (await fetch(BASE + `/api/products?ids=${PID}`)).json()
  console.log('STOCK after order:', before.items?.[0]?.stock, '(was 203; decrement', 203 - (before.items?.[0]?.stock ?? 203), ')')
}

const check = async () => {
  const before = await (await fetch(BASE + `/api/products?ids=${PID}`)).json()
  console.log('STOCK now:', before.items?.[0]?.stock)
}

const mode = process.argv[2] || 'place'
if (mode === 'place') place(); else check()
