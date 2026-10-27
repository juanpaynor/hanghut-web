import { createOpenAPI } from 'fumadocs-openapi/server'

/**
 * The reference is generated from `openapi.yaml` at the repo root -- the same
 * file that will feed the MCP server and any client SDK. There is no generated
 * MDX checked in: `staticSource()` turns the spec into virtual pages at build
 * time, so the spec is the only thing anyone has to keep true.
 */
export const openapi = createOpenAPI({
    input: ['./openapi.yaml'],
})
