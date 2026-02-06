import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin/', '/organizer/', '/checkout/', '/scan/'],
        },
        sitemap: 'https://hanghut.com/sitemap.xml',
    };
}
