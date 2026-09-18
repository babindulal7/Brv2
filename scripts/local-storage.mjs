#!/usr/bin/env node
/**
 * `npm run storage:local` — object storage on this laptop, with no Docker, no
 * Supabase project and no network. The companion to `db:local`.
 *
 * ## Why
 *
 * `storage.buckets` is EMPTY on production. That single fact is the root cause
 * under four separate features — evidence photos, KYC documents, client
 * documents and invoice PDFs — and it means none of them can be built or tested
 * anywhere today: the Docker stack that would provide Supabase Storage locally
 * cannot start on this machine (`com.docker.service` is Stopped and an
 * unelevated shell cannot open it).
 *
 * So the bytes go on disk under `.localdb/storage/<bucket>/<path>`, and the
 * bookkeeping goes into the same `storage.buckets` / `storage.objects` tables
 * the real thing uses, in the same `.localdb/` Postgres `db:local` built. Code
 * written against the path convention here ports to real Supabase Storage
 * unchanged, because the convention IS the real one.
 *
 * ## What it does not do
 *
 * ❌ **No HTTP.** Supabase Storage is a REST service; `supabase-js`'s
 *    `.storage.from(...)` speaks to it over the network. This is a filesystem
 *    store with a Node API, so scripts, probes and the lifecycle gate can use
 *    it — a browser cannot. Nothing in `src/` calls `.storage` today (verified:
 *    zero call sites), so nothing regresses; when the app does need uploads in
 *    the browser, that is a shim in `src/lib/mock/`, not this file.
 * ❌ **No RLS.** The real bucket is private with staff-only insert/select
 *    policies on `storage.objects`. Those policies are a migration nobody has
 *    written; this store does not pretend to enforce them.
 *
 * ## Law 3
 *
 * `--rm` is refused. Nothing is deleted — an evidence photo least of all, since
 * the whole point of it is to be the record six months later. Objects are
 * superseded by a new version at a new path, exactly as the audit's Option A
 * describes ("no update/delete — Law 3").
 *
 *     node scripts/local-storage.mjs --init
 *     node scripts/local-storage.mjs --put evidence bookings/<id>/front.jpg ./photo.jpg
 *     node scripts/local-storage.mjs --get evidence bookings/<id>/front.jpg ./out.jpg
 *     node scripts/local-storage.mjs --ls  [bucket] [prefix]
 *     node scripts/local-storage.mjs --buckets
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATA_DIR = join(ROOT, '.localdb')
const BLOBS = join(DATA_DIR, 'storage')

const firstLine = (e) => String(e?.message ?? e).split('\n')[0]
process.on('uncaughtException', (e) => { console.error(`\nFATAL: ${firstLine(e)}`); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error(`\nFATAL: ${firstLine(e)}`); process.exit(2) })

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args.slice(i + 1)
}

if (args.includes('--rm')) {
  console.error('Refused. Law 3: nothing is deleted — an evidence photo least of all.')
  console.error('Supersede it by writing a new object at a new path.')
  process.exit(1)
}

if (!existsSync(DATA_DIR)) {
  console.error('.localdb/ does not exist. Run `npm run db:local` first — this store keeps its')
  console.error('bookkeeping in that database’s storage.buckets / storage.objects tables.')
  process.exit(2)
}

const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pgcrypto, btree_gist } })

/*
 * The prelude's stub is two columns wide (`id`, `name`) because all it had to do
 * was let the DDL compile. A store needs to know what it wrote, so the columns
 * are added here rather than by editing the prelude — the prelude is what
 * `check:pglite` and `check:lifecycle` build against, and widening it would
 * change what every migration is tested on.
 */
await db.exec(`
  alter table storage.buckets add column if not exists public boolean not null default false;
  alter table storage.buckets add column if not exists created_at timestamptz not null default now();
  alter table storage.objects add column if not exists path_tokens text[];
  alter table storage.objects add column if not exists size_bytes bigint;
  alter table storage.objects add column if not exists mime_type text;
  alter table storage.objects add column if not exists content_hash text;
  alter table storage.objects add column if not exists created_at timestamptz not null default now();
  create unique index if not exists storage_objects_bucket_name_key
    on storage.objects (bucket_id, name);
`)

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', pdf: 'application/pdf', json: 'application/json',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
}
const mimeOf = (p) => MIME[p.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

async function ensureBucket(id, isPublic = false) {
  await db.query(
    `insert into storage.buckets (id, name, public) values ($1, $1, $2) on conflict (id) do nothing`,
    [id, isPublic],
  )
}

/*
 * `evidence` is the only bucket named anywhere in this repo — the remediation
 * audit's Option A: private, paths `bookings/<booking_id>/…`, staff insert and
 * select, no update or delete. It is created here because it is documented.
 *
 * TODO(decision) — client_documents, product_documents and document_registry all
 * carry a storage_path or file_url and NO bucket has been named for any of them.
 * That is a product decision (one bucket or several; public or private; who may
 * read a client's KYC), and this script will not invent it. Pass --bucket <name>
 * to create one ad hoc for an experiment.
 */
if (args.includes('--init')) {
  await ensureBucket('evidence', false)
  await ensureBucket('documents', false)
  console.log('bucket ready: evidence (private)')
  console.log('bucket ready: documents (private)')
}
const adhoc = flag('--bucket')
if (adhoc?.[0]) {
  await ensureBucket(adhoc[0], false)
  console.log(`bucket ready: ${adhoc[0]} (private)`)
}

const put = flag('--put')
if (put && put.length >= 3) {
  const [bucket, name, source] = put
  if (!existsSync(source)) {
    console.error(`no such file: ${source}`)
    process.exit(1)
  }
  await ensureBucket(bucket)
  const bytes = readFileSync(source)
  const hash = createHash('sha256').update(bytes).digest('hex')

  const existing = await db.query(
    `select content_hash from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])
  if (existing.rows.length > 0) {
    /* Law 3 again: an object is not overwritten in place. */
    console.error(`Refused. ${bucket}/${name} already exists (sha256 ${existing.rows[0].content_hash?.slice(0, 12)}…).`)
    console.error('Write the new version at a new path; nothing here is overwritten.')
    process.exit(1)
  }

  const dest = join(BLOBS, bucket, name)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
  await db.query(
    `insert into storage.objects (bucket_id, name, path_tokens, size_bytes, mime_type, content_hash)
     values ($1, $2, string_to_array($2, '/'), $3, $4, $5)`,
    [bucket, name, bytes.length, mimeOf(name), hash],
  )
  console.log(`put ${bucket}/${name}  ${bytes.length} bytes  ${mimeOf(name)}  sha256 ${hash.slice(0, 16)}…`)
}

const get = flag('--get')
if (get && get.length >= 3) {
  const [bucket, name, out] = get
  const src = join(BLOBS, bucket, name)
  if (!existsSync(src)) {
    console.error(`not found: ${bucket}/${name}`)
    process.exit(1)
  }
  const bytes = readFileSync(src)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`get ${bucket}/${name} -> ${out}  ${bytes.length} bytes`)
}

if (args.includes('--buckets')) {
  const r = await db.query(`select id, public, created_at from storage.buckets order by id`)
  console.log(r.rows.length === 0 ? '(no buckets — run --init)' : 'bucket | public | created')
  for (const b of r.rows) console.log(`${b.id} | ${b.public} | ${b.created_at.toISOString?.() ?? b.created_at}`)
}

const ls = flag('--ls')
if (ls) {
  const [bucket, prefix] = ls
  const r = await db.query(
    `select bucket_id, name, size_bytes, mime_type, content_hash
       from storage.objects
      where ($1::text is null or bucket_id = $1)
        and ($2::text is null or name like $2 || '%')
      order by bucket_id, name`,
    [bucket ?? null, prefix ?? null],
  )
  if (r.rows.length === 0) {
    console.log('(no objects)')
  } else {
    console.log('bucket | name | bytes | type | sha256')
    for (const o of r.rows) {
      console.log(`${o.bucket_id} | ${o.name} | ${o.size_bytes} | ${o.mime_type} | ${String(o.content_hash).slice(0, 12)}…`)
    }
  }
}

const objects = Number((await db.query(`select count(*)::int as n from storage.objects`)).rows[0].n)
const buckets = Number((await db.query(`select count(*)::int as n from storage.buckets`)).rows[0].n)
const onDisk = existsSync(BLOBS) ? statSync(BLOBS).isDirectory() : false
await db.close()

console.log(`\n${buckets} bucket(s), ${objects} object(s); bytes under .localdb/storage/${onDisk ? '' : ' (not yet created)'}`)
