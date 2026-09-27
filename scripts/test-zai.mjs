import ZAI from 'z-ai-web-dev-sdk';
try {
  const zai = await ZAI.create();
  console.log("ZAI instance created OK — AI works in this sandbox");
  const r = await zai.chat.completions.create({ messages: [{ role: 'user', content: 'say OK' }] });
  console.log("chat response:", r.choices[0].message.content?.slice(0, 50));
} catch (e) {
  console.log("ZAI create FAILED:", e.message?.slice(0, 200));
}
