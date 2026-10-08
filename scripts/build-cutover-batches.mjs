import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const batches = [
  {
    name: 'supabase_cutover_batch_1_0079_to_0105.sql',
    start: 79,
    end: 105,
    desc: 'Core booking transitions, RLS guards, RPCs (create_invoice), floor stage gates'
  },
  {
    name: 'supabase_cutover_batch_2_0106_to_0130.sql',
    start: 106,
    end: 130,
    desc: 'Closure gates, payment ceilings, server-side pricing, inspections, performance indexes'
  },
  {
    name: 'supabase_cutover_batch_3_0131_to_0152.sql',
    start: 131,
    end: 152,
    desc: 'Damage gates, crew/transport, security hardening D1-D7, short document numbering'
  }
];

const alreadyApplied = new Set([
  '0081_ruled_sequences_completion.sql',
  '0082_seed_operational_stage_corpus.sql',
  '0089_next_document_number_never_truncates.sql',
  '0140_stock_adjustments.sql',
  '0144_booking_project_type.sql',
  '0146_record_editor_transactions.sql',
  '0147_quote_editor_transactions.sql'
]);

const allFiles = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();

for (const b of batches) {
  let sql = '-- ====================================================================\n' +
    '-- Babin Rentals OS — Cutover Batch: ' + b.name + '\n' +
    '-- Scope: Migrations ' + b.start + ' to ' + b.end + '\n' +
    '-- Purpose: ' + b.desc + '\n' +
    '-- Paste into Supabase SQL Editor and click RUN\n' +
    '-- ====================================================================\n\n' +
    '-- Ensure migration probes and seed operations can insert lines under 0119 money guard\n' +
    "select set_config('app.in_create_booking', 'on', false);\n\n";

  const filesInBatch = allFiles.filter(f => {
    const m = f.match(/^(\d{4})/);
    if (!m) return false;
    const num = parseInt(m[1], 10);
    return num >= b.start && num <= b.end && !alreadyApplied.has(f);
  });

  console.log(`${b.name}: ${filesInBatch.length} migrations`);

  for (const f of filesInBatch) {
    const content = readFileSync(`supabase/migrations/${f}`, 'utf8');
    sql += '-- >>> START ' + f + ' <<<\n';
    sql += content + '\n';
    sql += '-- >>> END ' + f + ' <<<\n\n';
  }

  sql += "-- Reset migration probe session setting\n" +
    "select set_config('app.in_create_booking', 'off', false);\n";

  writeFileSync(b.name, sql, 'utf8');
}
console.log('All 3 cutover batches generated successfully.');
