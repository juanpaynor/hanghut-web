import { SupabaseClient } from '@supabase/supabase-js'

export type ReportWithDetails = {
    id: string
    target_id: string
    target_type: 'user' | 'table' | 'message' | 'other'
    reason_category: string
    description: string | null
    status: string
    created_at: string
    reporter: {
        id: string
        display_name: string | null
        user_photos: { photo_url: string }[] | null
    } | null
    reported: {
        id: string
        display_name: string | null
        user_photos: { photo_url: string }[] | null
    } | null
    evidence_url: string | null
}

export type ReportsResponse = {
    reports: ReportWithDetails[]
    totalCount: number
    currentPage: number
    totalPages: number
}

export async function getReports(
    supabase: SupabaseClient,
    page: number = 1,
    pageSize: number = 20,
    status: string = 'all',
    search: string = ''
): Promise<ReportsResponse> {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // 1. Base Query
    let query = supabase
        .from('reports')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

    // 2. Filter by status
    if (status && status !== 'all') {
        query = query.eq('status', status)
    }

    // 3. Execute Pagination
    const { data: rawReports, count, error } = await query.range(from, to)

    if (error || !rawReports) {
        console.error('Error fetching reports:', error)
        return { reports: [], totalCount: 0, currentPage: page, totalPages: 0 }
    }

    // 4. Collect User IDs (Reporter + Target if target_type is user)
    const userIds = new Set<string>()
    rawReports.forEach((r) => {
        if (r.reporter_id) userIds.add(r.reporter_id)
        if (r.target_type === 'user' && r.target_id) userIds.add(r.target_id)
    })

    // 5. Fetch Users
    let usersMap = new Map<string, any>()
    if (userIds.size > 0) {
        const { data: users } = await supabase
            .from('users')
            .select('id, display_name, user_photos(photo_url)')
            .in('id', Array.from(userIds))

        if (users) {
            users.forEach((u) => usersMap.set(u.id, u))
        }
    }

    // 6. Manual Join & Search Filter
    // Note: Search is applied in memory here because joining on simple table is hard with dynamic IDs
    // For large scale, you'd want a view or a dedicated search index.
    const joinedReports = rawReports.map((r) => {
        const reporter = r.reporter_id ? usersMap.get(r.reporter_id) : null
        const reported =
            r.target_type === 'user' && r.target_id ? usersMap.get(r.target_id) : null

        // Extract screenshot from metadata if exists
        let evidence_url = null
        if (r.metadata && typeof r.metadata === 'object' && 'screenshot_url' in r.metadata) {
            evidence_url = (r.metadata as any).screenshot_url
        }

        return {
            id: r.id,
            target_id: r.target_id,
            target_type: r.target_type,
            reason_category: r.reason_category,
            description: r.description,
            status: r.status,
            created_at: r.created_at,
            reporter: reporter
                ? {
                    id: reporter.id,
                    display_name: reporter.display_name,
                    user_photos: reporter.user_photos || [],
                }
                : null,
            reported: reported
                ? {
                    id: reported.id,
                    display_name: reported.display_name,
                    user_photos: reported.user_photos || [],
                }
                : null,
            evidence_url,
        }
    })

    // 7. Apply Search (In-Memory)
    // Since we only fetched one page of reports, this search only filters the *current page*.
    // Ideally, search should happen at step 1. But since we need joined names, 
    // we would need a Supabase View or RPC to search properly.
    // For now, this is a limitation unless we change Strategy.
    let finalReports = joinedReports
    if (search) {
        const lowerSearch = search.toLowerCase()
        finalReports = finalReports.filter(
            (r) =>
                r.reporter?.display_name?.toLowerCase().includes(lowerSearch) ||
                r.reported?.display_name?.toLowerCase().includes(lowerSearch) ||
                r.reason_category.toLowerCase().includes(lowerSearch)
        )
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0

    return {
        reports: finalReports,
        totalCount: count || 0,
        currentPage: page,
        totalPages,
    }
}

export async function getReportById(supabase: SupabaseClient, id: string) {
    const { data: report, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !report) return null

    // Fetch reporter
    let reporter = null
    if (report.reporter_id) {
        const { data: u } = await supabase
            .from('users')
            .select('id, display_name, trust_score, user_photos(photo_url)')
            .eq('id', report.reporter_id)
            .single()
        reporter = u
    }

    // Fetch reported target (if user)
    let reported = null
    let reportedUserReportCount = 0

    if (report.target_type === 'user' && report.target_id) {
        const { data: u } = await supabase
            .from('users')
            .select('id, display_name, trust_score, user_photos(photo_url)')
            .eq('id', report.target_id)
            .single()
        reported = u

        // Get count of reports against this user
        const { count } = await supabase
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('target_id', report.target_id)
            .eq('target_type', 'user')

        reportedUserReportCount = count || 0
    }

    // Metadata evidence
    let evidence_url = null
    if (report.metadata && typeof report.metadata === 'object' && 'screenshot_url' in report.metadata) {
        evidence_url = (report.metadata as any).screenshot_url
    }

    return {
        ...report,
        reason_category: report.reason_category, // explicit map
        reporter,
        reported,
        reportedUserReportCount,
        evidence_url
    }
}

export async function getUserReports(supabase: SupabaseClient, userId: string) {
    // Reports AGAINST the user
    const { data: reports } = await supabase
        .from('reports')
        .select('*')
        .eq('target_id', userId)
        .eq('target_type', 'user')
        .order('created_at', { ascending: false })
        .limit(10)

    if (!reports) return []

    // Fetch reporters details for these reports
    const reporterIds = reports.map(r => r.reporter_id).filter(Boolean)
    const { data: reporters } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', reporterIds)

    const reportersMap = new Map(reporters?.map(r => [r.id, r]))

    return reports.map(r => ({
        ...r,
        reporter: r.reporter_id ? reportersMap.get(r.reporter_id) : null
    }))
}
