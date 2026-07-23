/* eslint-disable functional/immutable-data -- The test installs and restores controlled browser globals around the SDK lifecycle. */
import { describe, expect, mock, test } from 'bun:test'
import { InkronikBrowserClient } from './client.js'
import type { BrowserFetch, BrowserIngestRequest } from './types.js'

describe('InkronikBrowserClient fetch tracing', () => {
    test('parents an allowlisted API request to the current view and propagates only traceparent', async () => {
        const originalDescriptors = new Map(
            ['window', 'document', 'navigator', 'fetch', 'PerformanceObserver'].map(name => [
                name,
                Object.getOwnPropertyDescriptor(globalThis, name),
            ]),
        )
        const apiRequests: Array<Request> = []
        const collectorRequests: Array<Request> = []
        const fetchReceivers: Array<unknown> = []
        const fetchImpl = mock<BrowserFetch>(function fetchWithReceiver(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
            fetchReceivers.push(this)
            const request = new Request(input, init)

            if (request.url.startsWith('https://collector.example.com/')) {
                collectorRequests.push(request)

                return Promise.resolve(new Response(null, { status: 202 }))
            }

            apiRequests.push(request)

            return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
        })
        const performanceNow = mock(() => 12)
        performanceNow.mockReturnValueOnce(0)
        const history = {
            pushState: () => undefined,
            replaceState: () => undefined,
        }
        const location = {
            href: 'https://app.example.com/recordings?input=PAGE_SECRET#fragment',
            origin: 'https://app.example.com',
            pathname: '/recordings',
        }
        const navigatorValue = { userAgent: 'TestBrowser/1.0' }
        const documentValue = {
            visibilityState: 'visible',
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }
        const windowValue = {
            fetch: fetchImpl,
            history,
            location,
            navigator: navigatorValue,
            performance: { now: performanceNow, getEntriesByType: () => [] },
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }

        Object.defineProperties(globalThis, {
            window: { configurable: true, value: windowValue },
            document: { configurable: true, value: documentValue },
            navigator: { configurable: true, value: navigatorValue },
            fetch: { configurable: true, value: fetchImpl },
            PerformanceObserver: { configurable: true, value: undefined },
        })

        try {
            const client = new InkronikBrowserClient({
                publicKey: `ik_pub_${'a'.repeat(43)}`,
                collectorUrl: 'https://collector.example.com',
                tracePropagationOrigins: ['https://api.example.com'],
                flushIntervalMs: 60_000,
                user: { id: 'user_42' },
            })

            await windowValue.fetch('https://api.example.com/recordings?token=QUERY_SECRET', {
                method: 'POST',
                headers: { Authorization: 'Bearer HEADER_SECRET', 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputValue: 'BODY_SECRET' }),
            })
            await client.flush()
            await client.shutdown()

            const apiRequest = apiRequests.at(0)
            const collectorRequest = collectorRequests.at(0)
            const body = (await collectorRequest?.json()) as BrowserIngestRequest
            const rootSpan = body.spans.find(span => span.span_kind === 'internal')
            const clientSpan = body.spans.find(span => span.span_kind === 'client')
            const serialized = JSON.stringify(body)

            expect(body.public_key).toBe(`ik_pub_${'a'.repeat(43)}`)
            expect(body.events.length + body.spans.length).toBeGreaterThan(0)
            expect(apiRequest?.headers.get('traceparent')).toBe(`00-${clientSpan?.trace_id}-${clientSpan?.span_id}-01`)
            expect(clientSpan?.trace_id).toBe(rootSpan?.trace_id)
            expect(clientSpan?.parent_span_id).toBe(rootSpan?.span_id)
            expect(clientSpan?.http_url).toBe('https://api.example.com/recordings')
            expect(clientSpan?.user_id).toBe('user_42')
            expect(serialized).not.toContain('PAGE_SECRET')
            expect(serialized).not.toContain('QUERY_SECRET')
            expect(serialized).not.toContain('HEADER_SECRET')
            expect(serialized).not.toContain('BODY_SECRET')
            expect(fetchReceivers).not.toHaveLength(0)
            expect(fetchReceivers.every(receiver => receiver === windowValue)).toBe(true)
            expect(windowValue.fetch).toBe(fetchImpl)
        } finally {
            originalDescriptors.forEach((descriptor, name) => {
                if (descriptor === undefined) {
                    Reflect.deleteProperty(globalThis, name)
                } else {
                    Object.defineProperty(globalThis, name, descriptor)
                }
            })
        }
    })
})
