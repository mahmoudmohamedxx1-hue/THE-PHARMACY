import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
const img = fs.readFileSync('/tmp/live-prescription.png').toString('base64');
const zai = await ZAI.create();
const r = await zai.chat.completions.createVision({
  messages: [
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } },
      { type: 'text', text: 'Screenshot of Arabic pharmacy site prescription upload page. Focus on the upload area: is there any raw English text like "Choose File :No file chosen" visibly rendered? Describe exactly what the upload button/area looks like, any styling issues, overlapping or broken elements.' }
    ]}
  ]
});
console.log(r.choices[0].message.content);
