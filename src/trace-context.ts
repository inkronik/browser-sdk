import type { BrowserTraceContext } from './types.js'

const createHexIdentifier = (byteLength: number): string => {
    const value = Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), byte => byte.toString(16).padStart(2, '0')).join('')

    return /^0+$/u.test(value) ? createHexIdentifier(byteLength) : value
}

export const createRootBrowserTraceContext = (): BrowserTraceContext => ({
    traceId: createHexIdentifier(16),
    spanId: createHexIdentifier(8),
    parentSpanId: '',
})

export const toBrowserTraceparent = (context: BrowserTraceContext): string => `00-${context.traceId}-${context.spanId}-01`
