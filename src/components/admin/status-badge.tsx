export function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { bg: string; text: string; label: string }> = {
        pending: {
            bg: 'bg-yellow-500/10',
            text: 'text-yellow-500',
            label: 'Pending'
        },
        investigating: {
            bg: 'bg-blue-500/10',
            text: 'text-blue-500',
            label: 'Investigating'
        },
        resolved: {
            bg: 'bg-green-500/10',
            text: 'text-green-500',
            label: 'Resolved'
        },
        dismissed: {
            bg: 'bg-gray-500/10',
            text: 'text-gray-500',
            label: 'Dismissed'
        }
    }

    const variant = variants[status.toLowerCase()] || variants.pending

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variant.bg} ${variant.text}`}
        >
            {variant.label}
        </span>
    )
}
