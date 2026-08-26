import { DEFAULT_RETRY_BASE_MS } from './constants.js'
import type { BrowserTransportResult, SendBrowserBatchInput } from './types.js'

const delay = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds))

const postBatch = async (input: SendBrowserBatchInput): Promise<BrowserTransportResult> => {
    const body = JSON.stringify({ public_key: input.publicKey, environment: input.environment, events: input.events, spans: input.spans })

    if (input.useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const delivered = navigator.sendBeacon(`${input.collectorUrl}/v1/browser`, new Blob([body], { type: 'text/plain;charset=UTF-8' }))

        return { delivered }
    }

    const response = await input.fetchImpl(`${input.collectorUrl}/v1/browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
    })

    if (!response.ok) {
        throw new Error(`Inkronik browser ingest failed with status ${response.status}`)
    }

    return { delivered: true }
}

export const sendBrowserBatch = async (input: SendBrowserBatchInput): Promise<BrowserTransportResult> => {
    const attempts = Array.from({ length: input.useBeacon ? 1 : input.maxRetries + 1 }, (_, index) => index)

    return attempts.reduce<Promise<BrowserTransportResult>>(
        async (previous, attempt) => {
            const previousResult = await previous

            if (previousResult.delivered) {
                return previousResult
            }

            if (attempt > 0) {
                const jitter = Math.floor(Math.random() * DEFAULT_RETRY_BASE_MS)
                await delay(DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter)
            }

            return postBatch(input).catch(error => {
                if (attempt === attempts.length - 1) {
                    input.onError(error instanceof Error ? error : new Error(String(error)))
                }

                return { delivered: false }
            })
        },
        Promise.resolve({ delivered: false }),
    )
}
