// VLM check of the assistant-after screenshot
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'

const zai = await ZAI.create()
const img = fs.readFileSync('/tmp/assistant-after.png').toString('base64')
const c = await zai.chat.completions.createVision({
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'This is a screenshot of a pharmacy AI chat page. Answer these questions precisely: 1) Is there a chat conversation visible with a user message AND an AI assistant reply bubble? 2) Does the AI reply mention any medicine or health advice? 3) Are there any visible error messages? Keep it short.',
        },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + img } },
      ],
    },
  ],
  thinking: { type: 'disabled' },
})
console.log(c.choices?.[0]?.message?.content || 'NO CONTENT')
