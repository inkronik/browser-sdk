import { createInkronikBrowser } from '../index.js'
import type { CreateInkronikNextOptions, InkronikNextIntegration } from './types.js'

export const createInkronikNext = (options: CreateInkronikNextOptions): InkronikNextIntegration => {
    const client = createInkronikBrowser({ ...options, enableNavigationTracking: false })

    return {
        client,
        onRouterTransitionStart: (url, navigationType) => client.captureNavigation({ navigationType, url }),
    }
}

export type * from './types.js'
