import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    if (key) env[key] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testBatchObjects() {
  console.log('=== Checking Cutover Status on Live Supabase ===');

  // 1. Check create_invoice RPC (0096)
  const { error: invErr } = await supabase.rpc('create_invoice', { p_payload: {} });
  console.log('0096 create_invoice RPC:', invErr ? `EXISTS (Gate response: ${invErr.message})` : 'EXISTS (OK)');

  // 2. Check void_invoice RPC (0121)
  const { error: voidErr } = await supabase.rpc('void_invoice', { p_payload: {} });
  console.log('0121 void_invoice RPC:', voidErr ? `EXISTS (Gate response: ${voidErr.message})` : 'EXISTS (OK)');

  // 3. Check rental_drafts table (0125)
  const { error: draftErr } = await supabase.from('rental_drafts').select('id').limit(1);
  console.log('0125 rental_drafts table:', draftErr ? `ERROR: ${draftErr.message}` : 'EXISTS (Accessible)');

  // 4. Check booking_crew_lines table (0132)
  const { error: crewErr } = await supabase.from('booking_crew_lines').select('id').limit(1);
  console.log('0132 booking_crew_lines table:', crewErr ? `ERROR: ${crewErr.message}` : 'EXISTS (Accessible)');

  // 5. Check stock_adjustments table (0140)
  const { error: stockErr } = await supabase.from('stock_adjustments').select('id').limit(1);
  console.log('0140 stock_adjustments table:', stockErr ? `ERROR: ${stockErr.message}` : 'EXISTS (Accessible)');

  // 6. Check intel_field_definitions table (0143)
  const { error: intelErr } = await supabase.from('intel_field_definitions').select('id').limit(1);
  console.log('0143 intel_field_definitions table:', intelErr ? `ERROR: ${intelErr.message}` : 'EXISTS (Accessible)');

  // 7. Check bookings project_type (0144)
  const { error: ptErr } = await supabase.from('bookings').select('project_type').limit(1);
  console.log('0144 bookings.project_type column:', ptErr ? `ERROR: ${ptErr.message}` : 'EXISTS (Accessible)');

  // 8. Check read_record_editor RPC (0146)
  const { error: recErr } = await supabase.rpc('read_record_editor', { p_kind: 'client', p_id: '00000000-0000-0000-0000-000000000000' });
  console.log('0146 read_record_editor RPC:', recErr ? `EXISTS (Response: ${recErr.message})` : 'EXISTS (OK)');

  // 9. Check read_quote_editor RPC (0147)
  const { error: qeErr } = await supabase.rpc('read_quote_editor', { p_id: '00000000-0000-0000-0000-000000000000' });
  console.log('0147 read_quote_editor RPC:', qeErr ? `EXISTS (Response: ${qeErr.message})` : 'EXISTS (OK)');

  // 10. Check anon view closure (0148)
  const { error: anonErr } = await supabase.from('clients_v').select('*').limit(1);
  console.log('0148 clients_v anon view leakage closure:', anonErr ? `SECURED (${anonErr.message})` : 'WARNING: LEAKING');
}

testBatchObjects();
