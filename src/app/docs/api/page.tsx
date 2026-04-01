import { Metadata } from 'next'
import { ApiDocsClient } from './api-docs-client'

export const metadata: Metadata = {
    title: 'API Documentation | HangHut',
    description: 'HangHut Public API v1 — integrate event ticketing into your website or app. Multi-language code samples for curl, JavaScript, Python, PHP, and Ruby.',
}

export default function ApiDocsPage() {
    return <ApiDocsClient />
}
