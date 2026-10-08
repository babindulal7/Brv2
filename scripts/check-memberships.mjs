import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/SUPABASE_DB_URL=(.+)/);
const connStr = match[1].trim();
const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function checkAuthMembership() {
  await client.connect();
  const res = await client.query(`
    select r.rolname as role, m.rolname as member
    from pg_auth_members a
    join pg_roles r on r.oid = a.roleid
    join pg_roles m on m.oid = a.member
    where m.rolname in ('authenticated', 'anon', 'postgres');
  `);
  console.log('Role memberships:', res.rows);
  await client.end();
}

checkAuthMembership().catch(console.error);
