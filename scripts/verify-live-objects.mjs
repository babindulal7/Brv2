import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (key) env[key] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('--- Checking Remote Supabase Schema Objects ---');

  // 1. stock_adjustments table
  const { data: sa, error: saErr } = await supabase.from('stock_adjustments').select('id').limit(1);
  console.log('1. stock_adjustments:', saErr ? `ERROR: ${saErr.message}` : 'EXISTS');

  // 2. bookings.project_type column
  const { data: b, error: bErr } = await supabase.from('bookings').select('project_type').limit(1);
  console.log('2. bookings.project_type:', bErr ? `ERROR: ${bErr.message}` : 'EXISTS');

  // 3. read_record_editor RPC
  const { data: rre, error: rreErr } = await supabase.rpc('read_record_editor', { p_kind: 'client', p_id: '00000000-0000-0000-0000-000000000000' });
  const rreMissing = rreErr && (rreErr.message.includes('Could not find') || rreErr.code === 'PGRST202');
  console.log('3. read_record_editor:', rreMissing ? `MISSING (${rreErr.message})` : `EXISTS (Response: ${rreErr ? rreErr.message : 'OK'})`);

  // 4. read_quote_editor RPC
  const { data: rqe, error: rqeErr } = await supabase.rpc('read_quote_editor', { p_id: '00000000-0000-0000-0000-000000000000' });
  const rqeMissing = rqeErr && (rqeErr.message.includes('Could not find') || rqeErr.code === 'PGRST202');
  console.log('4. read_quote_editor:', rqeMissing ? `MISSING (${rqeErr.message})` : `EXISTS (Response: ${rqeErr ? rqeErr.message : 'OK'})`);
}

run();
