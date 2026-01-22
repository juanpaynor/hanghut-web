'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface ReportActionsProps {
    reportId: string
    currentStatus: string
}

export function ReportActions({ reportId, currentStatus }: ReportActionsProps) {
    const [status, setStatus] = useState(currentStatus)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()
    const supabase = createClient()

    const handleStatusUpdate = async () => {
        if (status === currentStatus) {
            toast({
                title: 'No changes',
                description: 'Status is already set to this value',
            })
            return
        }

        setLoading(true)

        const { error } = await supabase
            .from('reports')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', reportId)

        if (error) {
            toast({
                title: 'Error',
                description: 'Failed to update report status',
                variant: 'destructive',
            })
            setLoading(false)
            return
        }

        toast({
            title: 'Success',
            description: 'Report status updated successfully',
        })

        setLoading(false)
        router.refresh()
    }

    return (
        <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
                <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="text-sm font-medium text-slate-400 mb-2 block">
                            Update Status
                        </label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="investigating">Investigating</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="dismissed">Dismissed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        onClick={handleStatusUpdate}
                        disabled={loading || status === currentStatus}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {loading ? 'Updating...' : 'Update Status'}
                    </Button>
                </div>

                <div className="pt-4 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-2">Future Actions</p>
                    <div className="flex gap-2">
                        <Button variant="outline" className="border-slate-600" disabled>
                            Warn User
                        </Button>
                        <Button variant="outline" className="border-slate-600" disabled>
                            Ban User
                        </Button>
                        <Button variant="outline" className="border-slate-600" disabled>
                            Delete Content
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
