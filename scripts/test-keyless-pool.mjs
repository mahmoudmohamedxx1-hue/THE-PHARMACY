// Integration test: force the keyless pool (ZAI off) and verify real pharmacy
// prompts get useful replies through Pollinations/Kilo/LLM7.
import { chatComplete, __setZAIFactoryForTests } from '../src/lib/ai'

__setZAIFactoryForTests(async () => null) // simulate "no GLM SDK on this box"

const system = `You are "The Pharmacy Assistant", a friendly virtual pharmacist for an Egyptian online pharmacy. Help the user pick suitable products ONLY from the catalog below and give safe general health tips.
Strict rules:
1) Never diagnose or prescribe prescription medicines - refer to our pharmacist or prescription upload.
2) End your reply with suggested catalog products in EXACT format:
PRODUCTS: Product Name 1; Product Name 2
3) Keep replies concise and friendly (max 6 sentences).
Available catalog:
- Doliprane 1000 Paracetamol Tablets | اقراص دوليبران 1000 باراسيتامول | Doliprane | 45 EGP
- Panadol Extra Tablets | بانادول اكسترا | Panadol | 60 EGP
- Vitamin C 1000mg Effervescent | فيتامين سي فوار | Viterra | 85 EGP`

const r = await chatComplete(
  [
    { role: 'system', content: system },
    { role: 'user', content: 'I have a headache and mild fever, what do you suggest?' },
  ],
  { temperature: 0.4, maxTokens: 700 },
)

if (!r) {
  console.log('POOL_FAILED: all keyless providers failed')
  process.exit(1)
}
console.log(`PROVIDER: ${r.provider}`)
console.log(`REPLY: ${r.content.slice(0, 500)}`)
