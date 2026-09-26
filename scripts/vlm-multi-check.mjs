import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const zai = await ZAI.create();
async function check(path, question) {
  const img = fs.readFileSync(path).toString('base64');
  const r = await zai.chat.completions.createVision({
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } },
      { type: 'text', text: question }
    ]}]
  });
  console.log(`\n### ${path}\n` + r.choices[0].message.content.slice(0, 600));
}
await check('/tmp/admin-gate.png', 'Screenshot of an admin page. What does the main content show? Is there a login prompt/gate or dashboard content or an empty/blank area?');
await check('/tmp/search-panadol.png', 'Screenshot of a pharmacy site search results page for "panadol". Are product result cards visible with images and prices? How many roughly? Any empty state or error shown?');
await check('/tmp/assistant-result.png', 'Screenshot of an AI health assistant chat page. Is there a text input at the bottom where the user can type a message? What messages are visible in the chat?');
