// Test keyless vision providers with the test prescription image
import fs from 'node:fs'

const img = fs.readFileSync('/home/z/my-project/scripts/test_prescription.png')
const dataUrl = `data:image/png;base64,${img.toString('base64')}`

const PROMPT = 'List all medication names visible in this prescription image. Reply with just the names separated by semicolons.'

const candidates = [
  {
    name: 'Pollinations openai',
    url: 'https://text.pollinations.ai/openai/chat/completions',
    body: { model: 'openai', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 300 },
  },
  {
    name: 'Pollinations openai-fast',
    url: 'https://text.pollinations.ai/openai/chat/completions',
    body: { model: 'openai-fast', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 300 },
  },
  {
    name: 'Kilo nemotron-omni',
    url: 'https://api.kilo.ai/api/gateway/chat/completions',
    body: { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 1024 },
  },
  {
    name: 'Kilo openrouter/free',
    url: 'https://api.kilo.ai/api/gateway/chat/completions',
    body: { model: 'openrouter/free', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 1024 },
  },
  {
    name: 'LLM7 GLM-4.6V-Flash',
    url: 'https://api.llm7.io/v1/chat/completions',
    body: { model: 'GLM-4.6V-Flash', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 300 },
  },
  {
    name: 'LLM7 default',
    url: 'https://api.llm7.io/v1/chat/completions',
    body: { model: 'default', messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 300 },
  },
]

for (const c of candidates) {
  const t0 = Date.now()
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c.body),
      signal: AbortSignal.timeout(25000),
    })
    const txt = await res.text()
    let content = null
    let err = null
    try {
      const j = JSON.parse(txt)
      content = j.choices?.[0]?.message?.content
      if (!content) err = (j.error?.message || JSON.stringify(j).slice(0, 120))
    } catch { err = txt.slice(0, 120) }
    console.log(`${c.name}: status=${res.status} (${Date.now() - t0}ms) -> ${content ? `"${String(content).slice(0, 150)}"` : `NO CONTENT: ${err}`}`)
  } catch (e) {
    console.log(`${c.name}: ERROR ${String(e.message).slice(0, 80)} (${Date.now() - t0}ms)`)
  }
}
