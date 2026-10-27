import { loader } from 'fumadocs-core/source'
import { openapi } from './openapi'

export const source = loader({
    baseUrl: '/docs-next',
    source: await openapi.staticSource(),
    plugins: [openapi.loaderPlugin()],
})
