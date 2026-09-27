// Test AI provider chain: ZAI SDK (sandbox keyless) + freellmpool keyless providers
import ZAI from 'z-ai-web-dev-sdk'

const MODELS = ['glm-5.3-flash', 'glm-4.6-flash', 'glm-4.5-flash', undefined]

async function testZai(model) {
  const t0 = Date.now()
  try {
    const zai = await ZAI.create()
    const body = {
      messages: [
        { role: 'user', content: 'Reply with exactly: ZAI_OK' },
      ],
      thinking: { type: 'disabled' },
    }
    if (model) body.model = model
    const c = await zai.chat.completions.create(body)
    const content = c.choices?.[0]?.message?.content
    console.log(`ZAI model=${model || 'default'} -> "${String(content).slice(0, 40)}" (${Date.now() - t0}ms, served model: ${c.model || '?'})`)
    return { ok: true, model, content }
  } catch (e) {
    console.log(`ZAI model=${model || 'default'} -> ERROR: ${String(e?.message || e).slice(0, 120)} (${Date.now() - t0}ms)`)
    return { ok: false, model }
  }
}

async function testOpenAICompat(name, url, model, maxTokens = 512) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: KEYLESS_OK' }],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(20000),
    })
    const txt = await res.text()
    let content = null
    try {
      const j = JSON.parse(txt)
      content = j.choices?.[0]?.message?.content
      if (!content && j.choices?.[0]?.message?.reasoning) {
        content = `[reasoning-only] ${String(j.choices[0].message.reasoning).slice(0, 60)}`
      }
    } catch { content = txt.slice(0, 80) }
    console.log(`${name} (${model}) status=${res.status} -> "${String(content).slice(0, 60)}" (${Date.now() - t0}ms)`)
    return { ok: res.status === 200 && !!content, name }
  } catch (e) {
    console.log(`${name} (${model}) -> ERROR: ${String(e?.message || e).slice(0, 100)} (${Date.now() - t0}ms)`)
    return { ok: false, name }
  }
}

console.log('=== ZAI SDK (sandbox keyless) ===')
for (const m of MODELS) await testZai(m)

console.log('\n=== freellmpool keyless providers ===')
await testOpenAICompat('Pollinations', 'https://text.pollinations.ai/openai', 'openai-fast')
await testOpenAICompat('Kilo', 'https://api.kilo.ai/api/gateway/chat/completions', 'openrouter/free', 1024)
await testOpenAICompat('Kilo-stepfun', 'https://api.kilo.ai/api/gateway/chat/completions', 'stepfun/step-3.7-flash:free', 1024)
await testOpenAICompat('OVH', 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', 'Meta-Llama-3_3-70B-Instruct')
await testOpenAICompat('LLM7', 'https://api.llm7.io/v1/chat/completions', 'default')
