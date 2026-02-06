import { createClient } from '@/lib/supabase/client';
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createClient();
    const baseUrl = 'https://hanghut.com';

    // Static routes
    const routes = [
        '',
        '/login',
        '/terms',
        '/privacy-policy',
        '/organizer/register',
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 1,
    }));

    // Dynamic routes: Fetch active events
    const { data: events } = await supabase
        .from('events')
        .select('id, updated_at')
        .eq('status', 'active');

    const eventRoutes = (events || []).map((event) => ({
        url: `${baseUrl}/events/${event.id}`,
        lastModified: new Date(event.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    }));

    return [...routes, ...eventRoutes];
}
