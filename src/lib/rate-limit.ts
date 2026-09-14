// Simple in-memory sliding-window rate limiter.
// Good enough for a single-instance deployment (this app runs one Node/Bun
// process). If the app ever scales horizontally, swap the Map for Redis.

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/** Returns true if the action is allowed; records the hit when allowed. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key) || { hits: [] }
  // drop hits outside the window
  b.hits = b.hits.filter((t) => now - t < windowMs)
  if (b.hits.length >= max) {
    buckets.set(key, b)
    return false
  }
  b.hits.push(now)
  buckets.set(key, b)
  // opportunistic cleanup so the map cannot grow unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
  return true
}

/** Best-effort client IP extraction from proxy headers. */
export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  )
}
