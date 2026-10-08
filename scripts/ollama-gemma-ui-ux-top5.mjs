// scripts/ollama-gemma-ui-ux-top5.mjs
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
      content: 'For Babin Rentals OS (equipment rental software in Nepal with barcode scanning, bilingual EN/Nepali, Bikram Sambat calendar, and warehouse floor surfaces), list the Top 5 concrete, highest-impact UI/UX improvements ranked from #1 to #5 with actionable implementation steps.'
    }
  ],
  think: false,
  stream: true,
  options: {
    temperature: 0.2,
    num_predict: 350
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
