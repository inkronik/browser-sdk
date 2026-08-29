import type { InkronikBrowserClient } from '../client.js'
import type { BrowserNavigationType, CreateInkronikBrowserOptions } from '../types.js'

export type CreateInkronikNextOptions = Omit<CreateInkronikBrowserOptions, 'enableNavigationTracking'>

export type NextRouterTransitionHandler = (url: string, navigationType: BrowserNavigationType) => void

export interface InkronikNextIntegration {
    readonly client: InkronikBrowserClient
    readonly onRouterTransitionStart: NextRouterTransitionHandler
}
