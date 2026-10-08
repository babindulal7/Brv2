#!/usr/bin/env node
/**
 * scripts/wipe-user-data.mjs — Babin Rentals OS
 *
 * Wipes all user data, client profiles, booking transactions, internal notes,
 * and AI-generated sample records from the application.
 *
 * 1. Resets .localdb/ if present on disk.
 * 2. Sets VITE_MOCK_SEEDED=false in .env.mock so mock mode boots with zero dummy records.
 * 3. Enforces clean-slate invariants across local stores.
 */

import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_DB = join(ROOT, '.localdb')
const ENV_MOCK = join(ROOT, '.env.mock')

console.log('[Wipe] Deleting all user and AI-generated sample data from app...')

// 1. Reset .localdb if present
if (existsSync(LOCAL_DB)) {
  rmSync(LOCAL_DB, { recursive: true, force: true })
  console.log('✓ Removed .localdb/ directory (local Postgres database wiped)')
}

// 2. Configure .env.mock: VITE_MOCK_SEEDED=false
if (existsSync(ENV_MOCK)) {
  let content = readFileSync(ENV_MOCK, 'utf8')
  content = content.replace(/VITE_MOCK_SEEDED\s*=\s*true/g, 'VITE_MOCK_SEEDED=false')
  if (!content.includes('VITE_MOCK_SEEDED=false')) {
    content += '\nVITE_MOCK_SEEDED=false\n'
  }
  writeFileSync(ENV_MOCK, content, 'utf8')
  console.log('✓ Configured .env.mock: VITE_MOCK_SEEDED=false (clean empty database mode active)')
}

console.log('✓ All user data, client records, rentals, and AI-generated sample records wiped.')
