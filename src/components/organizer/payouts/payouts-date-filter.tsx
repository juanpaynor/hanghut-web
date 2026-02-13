'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DateRange } from 'react-day-picker'
import { startOfMonth, endOfMonth, parseISO, format } from 'date-fns'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { Button } from '@/components/ui/button'

export function PayoutsDateFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const [date, setDate] = useState<DateRange | undefined>({
        from: fromParam ? parseISO(fromParam) : startOfMonth(new Date()),
        to: toParam ? parseISO(toParam) : endOfMonth(new Date()),
    })

    const handleApply = () => {
        const params = new URLSearchParams(searchParams.toString())
        if (date?.from) {
            params.set('from', format(date.from, 'yyyy-MM-dd'))
        } else {
            params.delete('from')
        }

        if (date?.to) {
            params.set('to', format(date.to, 'yyyy-MM-dd'))
        } else {
            params.delete('to')
        }

        router.push(`?${params.toString()}`)
    }

    const handleClear = () => {
        setDate(undefined)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('from')
        params.delete('to')
        router.push(`?${params.toString()}`)
    }

    // Effect to standardise default values if params are empty? 
    // Actually better to let user pick.

    return (
        <div className="flex items-center gap-2">
            <DatePickerWithRange date={date} setDate={setDate} />
            <Button variant="secondary" onClick={handleApply}>
                Filter
            </Button>
            {(fromParam || toParam) && (
                <Button variant="ghost" onClick={handleClear}>
                    Clear
                </Button>
            )}
        </div>
    )
}
