import { createClient } from '@/lib/supabase/client';
import { MetadataRoute } from 'next';
import { USE_CASES } from '@/lib/marketing/use-cases';

const baseUrl = 'https://hanghut.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createClient();
    const now = new Date();

    // Public marketing + legal pages. (Do NOT list /organizer, /login, /checkout,
    // /admin, /scan — they're robots-disallowed or gated.)
    const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
        { path: '', priority: 1.0, freq: 'daily' },
        { path: '/events', priority: 0.9, freq: 'daily' },
        { path: '/ticketing', priority: 0.9, freq: 'weekly' },
        { path: '/use-cases', priority: 0.8, freq: 'monthly' },
        { path: '/experiences', priority: 0.8, freq: 'weekly' },
        { path: '/download', priority: 0.6, freq: 'monthly' },
        { path: '/terms-of-service', priority: 0.3, freq: 'yearly' },
        { path: '/privacy-policy', priority: 0.3, freq: 'yearly' },
        { path: '/child-safety', priority: 0.3, freq: 'yearly' },
        { path: '/copyright', priority: 0.3, freq: 'yearly' },
    ];

    const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((r) => ({
        url: `${baseUrl}${r.path}`,
        lastModified: now,
        changeFrequency: r.freq,
        priority: r.priority,
    }));

    // Use-case vertical pages
    const useCaseEntries: MetadataRoute.Sitemap = USE_CASES.map((u) => ({
        url: `${baseUrl}/use-cases/${u.slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.7,
    }));

    // Public active events
    const { data: events } = await supabase
        .from('events')
        .select('id, slug, updated_at')
        .eq('status', 'active')
        .neq('invite_only', true);

    const eventEntries: MetadataRoute.Sitemap = (events || []).map((event) => ({
        // Canonical form. The UUID still resolves, but listing it here would make
        // every sitemap entry a redirect.
        url: `${baseUrl}/events/${event.slug || event.id}`,
        lastModified: event.updated_at ? new Date(event.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.6,
    }));

    return [...staticEntries, ...useCaseEntries, ...eventEntries];
}
