// Probe keyless vision-capable providers for prescription OCR
import fs from 'fs';
const b64 = fs.readFileSync('/tmp/presc-sample.png').toString('base64');
const image = `data:image/png;base64,${b64}`;
const prompt = 'Read the prescription image. List every medicine name, dosage, and frequency exactly as written.';

const KILO = 'https://api.kilo.ai/api/gateway/chat/completions';
const candidates = [
  { name: 'kilo qwen2.5-vl', url: KILO, model: 'qwen/qwen2.5-vl-72b-instruct:free' },
  { name: 'kilo qwen2-vl-7b', url: KILO, model: 'qwen/qwen2-vl-7b-instruct:free' },
  { name: 'kilo gemini2.0flash', url: KILO, model: 'google/gemini-2.0-flash-exp:free' },
  { name: 'kilo llama32-vision', url: KILO, model: 'meta-llama/llama-3.2-11b-vision-instruct:free' },
  { name: 'kilo step-3.7-flash', url: KILO, model: 'stepfun/step-3.7-flash:free' },
  { name: 'kilo pixtral', url: KILO, model: 'mistralai/pixtral-12b:free' },
  { name: 'kilo nemotron-vl', url: KILO, model: 'nvidia/llama-3.1-nemotron-70b-instruct:free' },
];

for (const c of candidates) {
  try {
    const t0 = Date.now();
    const res = await fetch(c.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ]}],
        max_tokens: 600, temperature: 0.1,
      }),
      signal: AbortSignal.timeout(40000),
    });
    const j = await res.json().catch(() => null);
    const content = j?.choices?.[0]?.message?.content;
    const served = j?.model || '';
    const good = typeof content === 'string' && /panadol|augmentin|ventolin|cairo|clinic|500\s?mg|hassan/i.test(content);
    console.log(`${good ? '✓' : '✗'} ${c.name}: HTTP ${res.status} ${Date.now() - t0}ms served=${served} :: ${JSON.stringify(content).slice(0, 200)}`);
  } catch (e) {
    console.log(`✗ ${c.name}: ${String(e).slice(0, 80)}`);
  }
}

// Pollinations vision probe (openai-compatible endpoint with image)
try {
  const t0 = Date.now();
  const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image } },
      ]}],
    }),
    signal: AbortSignal.timeout(40000),
  });
  const j = await res.json().catch(() => null);
  const content = j?.choices?.[0]?.message?.content;
  const good = typeof content === 'string' && /panadol|augmentin|ventolin/i.test(content);
  console.log(`${good ? '✓' : '✗'} pollinations vision: HTTP ${res.status} ${Date.now() - t0}ms :: ${JSON.stringify(content).slice(0, 200)}`);
} catch (e) { console.log(`✗ pollinations vision: ${String(e).slice(0, 80)}`); }

// OVH Qwen2.5-VL probe
try {
  const t0 = Date.now();
  const res = await fetch('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen2.5-VL-72B-Instruct',
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image } },
      ]}],
      max_tokens: 600, temperature: 0.1,
    }),
    signal: AbortSignal.timeout(40000),
  });
  const j = await res.json().catch(() => null);
  const content = j?.choices?.[0]?.message?.content;
  const good = typeof content === 'string' && /panadol|augmentin|ventolin/i.test(content);
  console.log(`${good ? '✓' : '✗'} ovh qwen2.5-vl: HTTP ${res.status} ${Date.now() - t0}ms :: ${JSON.stringify(content).slice(0, 200)}`);
} catch (e) { console.log(`✗ ovh qwen2.5-vl: ${String(e).slice(0, 80)}`); }
