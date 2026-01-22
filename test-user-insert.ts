
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
// Fallback to .env if .env.local not found
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    dotenv.config({ path: '.env' })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function testInsert() {
    console.log('Testing insert into public.users...')
    const id = '00000000-0000-0000-0000-000000000000' // Test UUID

    // Attempt insert matching the trigger's logic
    const { data, error } = await supabase
        .from('users')
        .insert({
            id,
            email: 'test_trigger@example.com',
            display_name: 'Test Trigger',
            role: 'user',
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .select()

    if (error) {
        console.error('Insert failed:', error)
    } else {
        console.log('Insert successful:', data)
        // Cleanup
        await supabase.from('users').delete().eq('id', id)
    }
}

testInsert()
