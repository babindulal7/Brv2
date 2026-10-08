import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/SUPABASE_DB_URL\s*=\s*(.+)/i);
if (!match) {
  console.error('SUPABASE_DB_URL not found in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const singleFile = args.find(a => a.startsWith('--only='))?.split('=')[1];

const client = new pg.Client({
  connectionString: match[1].trim(),
  ssl: { rejectUnauthorized: false }
});

await client.connect();
console.log('Connected to remote Supabase.');

// Get applied migrations
const dbMigs = await client.query('SELECT version, name FROM supabase_migrations.schema_migrations;');
const appliedNames = new Set(dbMigs.rows.map(r => r.name || r.version));

const allFiles = fs.readdirSync('supabase/migrations')
  .filter(f => f.endsWith('.sql'))
  .sort();

// Find pending files between 0125 and 0152
const pendingFiles = allFiles.filter(f => {
  const m = f.match(/^(\d{4})/);
  if (!m) return false;
  const num = parseInt(m[1], 10);
  if (num < 125 || num > 152) return false;
  if (singleFile && !f.includes(singleFile)) return false;
  const baseName = f.replace(/\.sql$/, '');
  return !appliedNames.has(baseName);
});

console.log(`Found ${pendingFiles.length} migrations to apply:`);
pendingFiles.forEach(f => console.log('  -', f));

let appliedCount = 0;

for (const file of pendingFiles) {
  const baseName = file.replace(/\.sql$/, '');
  const filePath = path.join('supabase/migrations', file);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`\n>>> Applying ${file}...`);
  try {
    await client.query("SELECT set_config('app.in_create_booking', 'on', false);");
    
    // Execute migration SQL
    await client.query(sql);

    // Record migration
    const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    await client.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
      [version, baseName]
    );
    console.log(`[APPLIED OK] ${file} committed & recorded in schema_migrations.`);
    appliedCount++;
  } catch (err) {
    console.error(`[FAILED] ${file}:`);
    console.error(`  Code: ${err.code}`);
    console.error(`  Message: ${err.message}`);
    if (err.detail) console.error(`  Detail: ${err.detail}`);
    if (err.hint) console.error(`  Hint: ${err.hint}`);
    if (err.where) console.error(`  Where: ${err.where}`);
    console.error('Aborting execution.');
    break;
  }
}

await client.end();
console.log(`\nSummary: Successfully applied and recorded ${appliedCount}/${pendingFiles.length} migrations.`);
