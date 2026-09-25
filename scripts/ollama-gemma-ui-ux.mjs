// scripts/ollama-gemma-ui-ux.mjs
import http from 'http';

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const MODEL = 'gemma4:26b';

const systemPrompt = `You are an elite Principal Product Designer and UI/UX Ergonomics Architect specializing in high-throughput enterprise SaaS, industrial warehouse logistics, and field operations applications.`;

const userPrompt = `You are evaluating the UI/UX architecture of Babin Rentals OS — an operational system for equipment rental, events, and audiovisual gear in Nepal.

Current UI/UX Context & Features:
1. Navigation & Shell:
   - Desktop: Left collapsible sidebar with icon+label navigation, top search bar with Ctrl+K command palette, quick-create modal.
   - Mobile / Tablet: Responsive bottom bar (Today, Rentals, Scan, Operations, MoreSheet).
   - Theme: Light cream canvas (#FDEFDC) default for warehouse readability, dark mode (#050B12) option, custom font stack (@fontsource/outfit for titles, @fontsource/source-sans-3 for body, @fontsource/jetbrains-mono for numbers/codes).
   - Localization: English and Nepali toggle (Devanagari fonts Asar & Hind, Bikram Sambat BS calendar toggle alongside Gregorian AD).

2. Floor & Warehouse Ergonomics:
   - Workspaces: Packing Workspace, Handover/Dispatch Workspace, Return Triage Workspace, Reset/Maintenance Workspace.
   - Law 6: Floor surfaces (Pack/Handover/Return/Reset/Scanner) strictly strip all money and rates so technicians and floor staff focus purely on gear serials, condition tags, and quantity verification.
   - Barcode Scanner: In-app camera scanner (@zxing/browser) with audio feedback and haptic vibration for rapid multi-unit scans.
   - Law 12: Errors are inline, persistent, and actionable with resolution instructions; toasts carry success confirmations only.
   - Law 17: "The word 'customer' appears nowhere in the UI. They are clients."

3. Operational Desks:
   - Today Dashboard: Morning dispatch checklist, afternoon return triage queue, alerts panel (overdue returns, maintenance due).
   - New Rental Flow: Multi-step drawer with client selector, date range picker (BS & AD), gear catalogue with real-time stock availability, crew & transport pricing, payment advance collection.
   - Status Steppers: Draft → Confirmed → Packed → On Rent → Returned → Closed.

Task:
Provide a critical, high-impact UI/UX audit for Babin Rentals OS.
Structure your response into 5 actionable dimensions:
1. Floor & Warehouse Ergonomics (Touch targets, scan speed, high-noise/glare environments)
2. Bilingual & Calendar Usability (Nepali Devanagari typography, Bikram Sambat datepicker UX)
3. Information Hierarchy & Glanceability (Reducing cognitive load during busy turnaround hours)
4. Desktop Power-User Workflows (Keyboard navigation, dense data tables, rapid booking creation)
5. Actionable Next Steps (Top 5 immediate UI/UX improvements ranked by operational value)
Keep your analysis sharp, specific, and directly tailored to an audiovisual/equipment rental operation.`;

function queryGemma() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      think: false,
      stream: true,
      options: {
        temperature: 0.2,
        num_predict: 750
      }
    });

    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let fullText = '';
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              process.stdout.write(parsed.message.content);
              fullText += parsed.message.content;
            }
          } catch (e) {}
        }
      });

      res.on('end', () => {
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed.message?.content) {
              process.stdout.write(parsed.message.content);
              fullText += parsed.message.content;
            }
          } catch (e) {}
        }
        resolve(fullText);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🎨 Requesting UI/UX Audit & Improvement Ideas from Gemma 4`);
  console.log(`======================================================\n`);
  const start = Date.now();
  await queryGemma();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n======================================================`);
  console.log(`✅ Gemma UI/UX Audit finished in ${elapsed}s`);
  console.log(`======================================================\n`);
}

main().catch(console.error);
