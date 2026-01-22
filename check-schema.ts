
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
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

async function checkSchema() {
    console.log('Fetching public.users columns...')

    // We can't easily query information_schema via the JS client without a stored procedure,
    // but we can try to insert a dummy row with no columns to see what keys are returned/expected
    // or just try to select one row and see the keys.

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(1)

    if (error) {
        console.error('Error selecting users:', error)
        return
    }

    if (data && data.length > 0) {
        console.log('Columns found in existing row:', Object.keys(data[0]))
    } else {
        console.log('No rows found, trying to infer schema from error by selecting a non-existent column...')
        const { error: colError } = await supabase.from('users').select('non_existent_column').limit(1)
        if (colError) {
            console.log('Schema check hint:', colError.message)
        }
    }
}

checkSchema()
