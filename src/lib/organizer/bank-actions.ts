'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BankCode } from '@/lib/constants/banks'

// Bank Account Schema
const bankAccountSchema = z.object({
    bank_code: z.string().min(1, 'Bank is required'),
    bank_name: z.string().min(1, 'Bank name is required'),
    account_number: z.string().min(5, 'Account number is too short').max(20, 'Account number is too long'),
    account_holder_name: z.string().min(2, 'Account holder name is required'),
    is_primary: z.boolean().default(false),
})

export type BankAccountFormState = {
    errors?: {
        bank_code?: string[]
        account_number?: string[]
        account_holder_name?: string[]
        _form?: string[]
    }
    message?: string
}

export async function addBankAccount(
    prevState: BankAccountFormState | undefined,
    formData: FormData
): Promise<BankAccountFormState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { message: 'Unauthorized' }

    // Get partner
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { message: 'Partner profile not found' }

    const rawData = {
        bank_code: formData.get('bank_code'),
        bank_name: formData.get('bank_name'), // Hidden field or derived? We should trust code more
        account_number: formData.get('account_number'),
        account_holder_name: formData.get('account_holder_name'),
        is_primary: formData.get('is_primary') === 'on',
    }

    const validated = bankAccountSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            errors: validated.error.flatten().fieldErrors as any,
            message: 'Invalid fields'
        }
    }

    const { data } = validated

    // If making primary, unmark others
    if (data.is_primary) {
        await supabase
            .from('bank_accounts')
            .update({ is_primary: false })
            .eq('partner_id', partner.id)
    }

    // Insert
    const { error } = await supabase
        .from('bank_accounts')
        .insert({
            partner_id: partner.id,
            bank_code: data.bank_code,
            bank_name: data.bank_name,
            account_number: data.account_number,
            account_holder_name: data.account_holder_name,
            is_primary: data.is_primary ?? false
        })

    if (error) {
        return { message: 'Database error: ' + error.message }
    }

    revalidatePath('/organizer/payouts')
    return { message: 'Bank account added successfully!' }
}

export async function deleteBankAccount(id: string) {
    const supabase = await createClient()
    // RLS handles the auth check mostly but good to be explicit
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/organizer/payouts')
}

export async function setPrimaryBankAccount(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).single()
    if (!partner) return

    // 1. Unset all
    await supabase.from('bank_accounts').update({ is_primary: false }).eq('partner_id', partner.id)

    // 2. Set new
    await supabase.from('bank_accounts').update({ is_primary: true }).eq('id', id)

    revalidatePath('/organizer/payouts')
}
