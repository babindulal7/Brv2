import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://sxguwvgoserhdolewibb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4Z3V3dmdvc2VyaGRvbGV3aWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTk3OTksImV4cCI6MjA5MzgzNTc5OX0.1KX30S4B78yKO4l2bG-hhgQVflr4REAUISTa2B1YY3I'

// N-8: credentials never live in the repo. Run with:
//   $env:BABIN_STAFF_TEST_PASSWORD = '...'
const STAFF_PASSWORD = process.env.BABIN_STAFF_TEST_PASSWORD
if (!STAFF_PASSWORD) {
  console.error('Set BABIN_STAFF_TEST_PASSWORD to run this check.')
  process.exit(1)
}

const STAFF_ACCOUNTS = [
  { email: 'owner@babinrentals.com', expectedId: '00000000-0000-0000-0000-000000000101', expectedRole: 'Owner' },
  { email: 'manager@babinrentals.com', expectedId: '00000000-0000-0000-0000-000000000102', expectedRole: 'Admin' },
  { email: 'warehouse@babinrentals.com', expectedId: '00000000-0000-0000-0000-000000000103', expectedRole: 'Warehouse' },
  { email: 'billing@babinrentals.com', expectedId: '00000000-0000-0000-0000-000000000104', expectedRole: 'Coordinator' },
]

async function testLogins() {
  console.log('Testing Supabase Auth logins for staff accounts...\n')
  let allPassed = true

  for (const acc of STAFF_ACCOUNTS) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: STAFF_PASSWORD,
    })

    if (error) {
      console.error(`❌ [FAIL] ${acc.email}: sign-in failed: ${error.message}`)
      allPassed = false
      continue
    }

    if (!data.session || !data.user) {
      console.error(`❌ [FAIL] ${acc.email}: no session or user returned`)
      allPassed = false
      continue
    }

    if (data.user.id !== acc.expectedId) {
      console.error(`❌ [FAIL] ${acc.email}: ID mismatch. Expected ${acc.expectedId}, got ${data.user.id}`)
      allPassed = false
      continue
    }

    // Now verify auth_user_role() query using the authenticated client
    const { data: roleData, error: roleError } = await supabase.rpc('auth_user_role')
    if (roleError) {
      console.error(`❌ [FAIL] ${acc.email}: auth_user_role RPC failed: ${roleError.message}`)
      allPassed = false
      continue
    }

    if (roleData !== acc.expectedRole) {
      console.error(`❌ [FAIL] ${acc.email}: Role mismatch. Expected ${acc.expectedRole}, got ${roleData}`)
      allPassed = false
      continue
    }

    console.log(`✅ [PASS] ${acc.email}: signed in successfully, ID matches (${data.user.id}), auth_user_role() resolved to '${roleData}'`)
  }

  if (!allPassed) {
    process.exit(1)
  }
  console.log('\nAll staff accounts provisioned and authenticated successfully!')
}

testLogins().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
