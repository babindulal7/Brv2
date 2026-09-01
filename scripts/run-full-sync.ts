// Polyfill import.meta.env for Node environment before module evaluation.
// The anon key is environment only (value in .env.local) — it is no longer
// stored in this file.  PowerShell:  $env:VITE_SUPABASE_ANON_KEY="<key>"
if (typeof import.meta.env === 'undefined') {
  if (!process.env.VITE_SUPABASE_ANON_KEY) {
    console.error('Set VITE_SUPABASE_ANON_KEY first (value in .env.local). It is no longer stored in this file.')
    process.exit(1)
  }
  (import.meta as any).env = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://sxguwvgoserhdolewibb.supabase.co',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY
  };
}

import { runFullPull } from '../src/lib/booqable/sync'

async function main() {
  console.log('🚀 Initiating Full 1-Way Sync: Booqable → Babin Rentals OS Database...')
  try {
    const summary = await runFullPull({
      pageSize: 100,
    })
    console.log('✅ Sync Completed Successfully!')
    console.log('Summary:', JSON.stringify(summary, null, 2))
  } catch (err) {
    console.error('❌ Sync Failed:', err)
    process.exit(1)
  }
}

main()
