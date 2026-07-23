export { InkronikBrowserClient } from './client.js'
export { sanitizeBrowserAttributes, sanitizeBrowserUrl } from './sanitizer.js'
export type * from './types.js'

import { InkronikBrowserClient } from './client.js'
import type { CreateInkronikBrowserOptions } from './types.js'

export const createInkronikBrowser = (options: CreateInkronikBrowserOptions): InkronikBrowserClient => new InkronikBrowserClient(options)
