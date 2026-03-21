import { NextResponse } from 'next/server'

/**
 * Standardized success response
 */
export function apiSuccess(data: any, status = 200) {
    return NextResponse.json({ data }, { status, headers: corsHeaders() })
}

/**
 * Standardized error response
 */
export function apiError(message: string, status = 400) {
    return NextResponse.json(
        { error: { message, status } },
        { status, headers: corsHeaders() }
    )
}

/**
 * CORS headers for API routes
 */
export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
}

/**
 * Handle OPTIONS preflight for CORS
 */
export function handleCors() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
