/* eslint-disable functional/immutable-data -- The test installs and restores controlled browser globals around the SDK lifecycle. */
import { describe, expect, mock, setSystemTime, test } from 'bun:test'
import { InkronikBrowserClient } from './client.js'
import type { BrowserFetch, BrowserIngestRequest } from './types.js'

const installBrowserGlobals = (fetchImpl: BrowserFetch, performanceNow: () => number) => {
    const originalDescriptors = new Map(
        ['window', 'document', 'navigator', 'fetch', 'PerformanceObserver'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    )
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

    return {
        windowValue,
        restore: () => {
            originalDescriptors.forEach((descriptor, name) => {
                if (descriptor === undefined) {
                    Reflect.deleteProperty(globalThis, name)
                } else {
                    Object.defineProperty(globalThis, name, descriptor)
                }
            })
        },
    }
}

const readIngestRequest = (args: Parameters<BrowserFetch> | undefined): Promise<BrowserIngestRequest | null> =>
    args === undefined ? Promise.resolve(null) : (new Request(...args).json() as Promise<BrowserIngestRequest>)

describe('InkronikBrowserClient fetch tracing', () => {
    test('rejects a malformed deployment environment during initialization', () => {
        expect(
            () =>
                new InkronikBrowserClient({
                    publicKey: `ik_pub_${'a'.repeat(43)}`,
                    collectorUrl: 'https://collector.example.com',
                    environment: 'production/eu',
                }),
        ).toThrow(TypeError)
    })

    test('starts an independent trace for each allowlisted API request and propagates only traceparent', async () => {
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
        const { windowValue, restore } = installBrowserGlobals(fetchImpl, performanceNow)

        try {
            const client = new InkronikBrowserClient({
                publicKey: `ik_pub_${'a'.repeat(43)}`,
                collectorUrl: 'https://collector.example.com',
                environment: 'development',
                tracePropagationOrigins: ['https://api.example.com'],
                flushIntervalMs: 60_000,
                user: { id: 'user_42' },
            })

            client.captureError(new Error('Checkout failed for person@example.com'), {
                name: 'checkout_failed',
                message: 'Checkout stayed open for retry',
                attributes: { plan: 'pro' },
            })

            await windowValue.fetch('https://api.example.com/recordings?token=QUERY_SECRET', {
                method: 'POST',
                headers: { Authorization: 'Bearer HEADER_SECRET', 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputValue: 'BODY_SECRET' }),
            })
            await windowValue.fetch('https://api.example.com/operators', { method: 'GET' })
            await client.flush()
            await client.shutdown()

            const collectorRequest = collectorRequests.at(0)
            const body = (await collectorRequest?.json()) as BrowserIngestRequest
            const rootSpan = body.spans.find(span => span.span_kind === 'internal')
            const clientSpans = body.spans.filter(span => span.span_kind === 'client')
            const firstClientSpan = clientSpans.at(0)
            const secondClientSpan = clientSpans.at(1)
            const handledError = body.events.find(event => event.name === 'checkout_failed')
            const serialized = JSON.stringify(body)

            expect(body.public_key).toBe(`ik_pub_${'a'.repeat(43)}`)
            expect(body.environment).toBe('development')
            expect(body.events.length + body.spans.length).toBeGreaterThan(0)
            expect(clientSpans).toHaveLength(2)
            expect(apiRequests.at(0)?.headers.get('traceparent')).toBe(`00-${firstClientSpan?.trace_id}-${firstClientSpan?.span_id}-01`)
            expect(apiRequests.at(1)?.headers.get('traceparent')).toBe(`00-${secondClientSpan?.trace_id}-${secondClientSpan?.span_id}-01`)
            expect(firstClientSpan?.trace_id).not.toBe(rootSpan?.trace_id)
            expect(secondClientSpan?.trace_id).not.toBe(rootSpan?.trace_id)
            expect(secondClientSpan?.trace_id).not.toBe(firstClientSpan?.trace_id)
            expect(firstClientSpan?.parent_span_id).toBe('')
            expect(secondClientSpan?.parent_span_id).toBe('')
            expect(firstClientSpan?.view_id).toBe(rootSpan?.view_id)
            expect(secondClientSpan?.view_id).toBe(rootSpan?.view_id)
            expect(body.events.every(event => event.trace_id === rootSpan?.trace_id)).toBe(true)
            expect(handledError).toMatchObject({
                level: 'error',
                message: 'Checkout stayed open for retry',
                user_id: 'user_42',
                error_type: 'Error',
                error_message: 'Checkout failed for [REDACTED]',
                error_handled: true,
                attributes: { plan: 'pro' },
            })
            expect(handledError?.error_stack).toContain('Error: Checkout failed for [REDACTED]')
            expect(firstClientSpan?.http_url).toBe('https://api.example.com/recordings')
            expect(secondClientSpan?.http_url).toBe('https://api.example.com/operators')
            expect(firstClientSpan?.user_id).toBe('user_42')
            expect(secondClientSpan?.user_id).toBe('user_42')
            expect(serialized).not.toContain('PAGE_SECRET')
            expect(serialized).not.toContain('QUERY_SECRET')
            expect(serialized).not.toContain('HEADER_SECRET')
            expect(serialized).not.toContain('BODY_SECRET')
            expect(fetchReceivers).not.toHaveLength(0)
            expect(fetchReceivers.every(receiver => receiver === windowValue)).toBe(true)
            expect(windowValue.fetch).toBe(fetchImpl)
        } finally {
            restore()
        }
    })
})

describe('InkronikBrowserClient browser ingest queue', () => {
    const clientOptions = {
        publicKey: `ik_pub_${'a'.repeat(43)}`,
        collectorUrl: 'https://collector.example.com',
        environment: 'production',
        flushIntervalMs: 60_000,
    }

    test('drops expired events and spans while sending fresh events from the same queue', async () => {
        const fetchImpl = mock<BrowserFetch>(() => Promise.resolve(new Response(null, { status: 202 })))
        const { restore } = installBrowserGlobals(fetchImpl, () => 0)
        const startedAt = Date.parse('2026-11-09T10:35:51Z')
        setSystemTime(startedAt)
        const client = new InkronikBrowserClient(clientOptions)

        try {
            client.capture({ name: 'expired' })
            setSystemTime(startedAt + 1)
            client.capture({ name: 'at_boundary' })
            setSystemTime(startedAt + 24 * 60 * 60 * 1000 + 1)
            client.capture({ name: 'fresh' })
            await client.flush()

            expect(fetchImpl).toHaveBeenCalledTimes(1)
            const body = await readIngestRequest(fetchImpl.mock.calls.at(0))
            expect(body?.events.map(event => event.name)).toEqual(['at_boundary', 'fresh'])
            expect(body?.spans).toEqual([])
        } finally {
            await client.shutdown()
            setSystemTime()
            restore()
        }
    })

    test('drops the rejected batch after one HTTP 400 and flushes later events', async () => {
        const fetchImpl = mock<BrowserFetch>(() => Promise.resolve(new Response(null, { status: 202 })))
        fetchImpl.mockResolvedValueOnce(new Response(null, { status: 400 }))
        const onError = mock(() => undefined)
        const { restore } = installBrowserGlobals(fetchImpl, () => 0)
        const client = new InkronikBrowserClient({ ...clientOptions, maxRetries: 2, onError })

        try {
            client.capture({ name: 'rejected_event' })
            await client.flush()
            await client.flush()

            expect(fetchImpl).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Inkronik browser ingest failed with status 400' }))

            client.capture({ name: 'later_event' })
            await client.flush()

            expect(fetchImpl).toHaveBeenCalledTimes(2)
            const body = await readIngestRequest(fetchImpl.mock.calls.at(1))
            expect(body?.events.map(event => event.name)).toEqual(['later_event'])
            expect(body?.spans).toEqual([])
        } finally {
            await client.shutdown()
            restore()
        }
    })

    test('keeps a batch for the next flush after a transient 503', async () => {
        const fetchImpl = mock<BrowserFetch>(() => Promise.resolve(new Response(null, { status: 202 })))
        fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }))
        const { restore } = installBrowserGlobals(fetchImpl, () => 0)
        const client = new InkronikBrowserClient({ ...clientOptions, maxRetries: 0 })

        try {
            client.capture({ name: 'retryable_event' })
            await client.flush()
            await client.flush()

            expect(fetchImpl).toHaveBeenCalledTimes(2)
            const sent = await readIngestRequest(fetchImpl.mock.calls.at(0))
            const resent = await readIngestRequest(fetchImpl.mock.calls.at(1))
            expect(resent?.events.map(event => event.name)).toContain('retryable_event')
            expect(resent).toEqual(sent)
        } finally {
            await client.shutdown()
            restore()
        }
    })
})
