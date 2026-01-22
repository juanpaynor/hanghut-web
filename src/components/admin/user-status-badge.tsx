interface UserStatusBadgeProps {
    status: string
}

export function UserStatusBadge({ status }: UserStatusBadgeProps) {
    const styles = {
        active: 'bg-green-500/10 text-green-500',
        suspended: 'bg-yellow-500/10 text-yellow-500',
        banned: 'bg-red-500/10 text-red-500',
        deleted: 'bg-gray-500/10 text-gray-500',
    }

    const normalizedStatus = status.toLowerCase()
    const style = styles[normalizedStatus as keyof typeof styles] || styles.active

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${style}`}
        >
            {status}
        </span>
    )
}
