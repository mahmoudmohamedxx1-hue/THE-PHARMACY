import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
const img = fs.readFileSync('/tmp/live-home-products.png').toString('base64');
const zai = await ZAI.create();
const r = await zai.chat.completions.createVision({
  messages: [
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } },
      { type: 'text', text: 'This is a screenshot of an Arabic e-commerce pharmacy site. Describe: 1) Are product cards rendering correctly with images, names, prices? 2) Any visual bugs (broken images, overlapping text, empty sections, layout issues)? Be specific and concise.' }
    ]}
  ]
});
console.log(r.choices[0].message.content);
