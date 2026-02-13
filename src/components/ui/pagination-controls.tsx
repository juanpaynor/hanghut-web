"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationControlsProps {
    totalCount: number
    pageSize?: number
    paramName?: string
}

export function PaginationControls({
    totalCount,
    pageSize = 10,
    paramName = "page"
}: PaginationControlsProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const currentPage = Number(searchParams.get(paramName)) || 1
    const totalPages = Math.ceil(totalCount / pageSize)

    const createPageURL = (pageNumber: number | string) => {
        const params = new URLSearchParams(searchParams)
        params.set(paramName, pageNumber.toString())
        return `${pathname}?${params.toString()}`
    }

    const handlePageChange = (page: number) => {
        router.push(createPageURL(page))
    }

    if (totalPages <= 1) return null

    return (
        <div className="flex items-center justify-end space-x-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                </Button>
                <div className="text-sm font-medium">
                    Page {currentPage} of {totalPages}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
    )
}
