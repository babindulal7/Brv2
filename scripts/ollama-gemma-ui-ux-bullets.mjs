// scripts/ollama-gemma-ui-ux-bullets.mjs
import http from 'http';

const postData = JSON.stringify({
  model: 'gemma4:26b',
  messages: [
    {
      role: 'system',
      content: 'You are an elite Principal UX/UI Ergonomics Designer for enterprise warehouse and equipment rental operations.'
    },
    {
      role: 'user',
      content: `For Babin Rentals OS (rental gear app in Nepal), summarize your top 5 UI/UX improvements into a high-density, actionable executive checklist. Exactly 5 points (#1 to #5), 2-3 sentences each:
1. Scanner Peripheral Feedback & Haptics
2. Oversized Floor Touch Targets & Gloved Mode
3. Dual Date System (Gregorian AD + Bikram Sambat BS) & Devanagari Typography
4. Rush-Hour Information Glanceability & Law 6
5. Outdoor High-Glare High-Contrast Mode`
    }
  ],
  think: false,
  stream: true,
  options: {
    temperature: 0.2,
    num_predict: 400
  }
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 11434,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let buffer = '';
  res.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) process.stdout.write(parsed.message.content);
      } catch (e) {}
    }
  });
  res.on('end', () => console.log('\n[DONE]'));
});

req.write(postData);
req.end();
