// Polyfill import.meta.env for Node environment before module evaluation
if (typeof import.meta.env === 'undefined') {
  (import.meta as any).env = {
    VITE_SUPABASE_URL: 'https://sxguwvgoserhdolewibb.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4Z3V3dmdvc2VyaGRvbGV3aWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTk3OTksImV4cCI6MjA5MzgzNTc5OX0.1KX30S4B78yKO4l2bG-hhgQVflr4REAUISTa2B1YY3I'
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
