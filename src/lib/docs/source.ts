import { loader } from 'fumadocs-core/source'
import { openapi } from './openapi'

export const source = loader({
    baseUrl: '/docs/api',
    source: await openapi.staticSource(),
    plugins: [openapi.loaderPlugin()],
})
