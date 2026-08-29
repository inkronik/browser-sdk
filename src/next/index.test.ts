/* eslint-disable functional/immutable-data -- The test installs and restores controlled browser globals around the SDK lifecycle. */
import { describe, expect, mock, test } from 'bun:test'
import type { BrowserFetch, BrowserIngestRequest } from '../types.js'
import { createInkronikNext } from './index.js'

describe('createInkronikNext', () => {
    test('uses the Next.js transition hook without patching History or duplicating navigation', async () => {
        const originalDescriptors = new Map(
            ['window', 'document', 'navigator', 'fetch', 'PerformanceObserver'].map(name => [
                name,
                Object.getOwnPropertyDescriptor(globalThis, name),
            ]),
        )
        const collectorRequests: Array<Request> = []
        const fetchImpl = mock<BrowserFetch>((input, init) => {
            collectorRequests.push(new Request(input, init))
            return Promise.resolve(new Response(null, { status: 202 }))
        })
        const originalPushState = () => undefined
        const originalReplaceState = () => undefined
        const history = { pushState: originalPushState, replaceState: originalReplaceState }
        const location = {
            href: 'https://shop.example.com/',
            origin: 'https://shop.example.com',
            pathname: '/',
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
            performance: { now: () => 0, getEntriesByType: () => [] },
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
            const integration = createInkronikNext({
                publicKey: `ik_pub_${'a'.repeat(43)}`,
                collectorUrl: 'https://collector.example.com',
                environment: 'test',
                flushIntervalMs: 60_000,
            })

            expect(history.pushState).toBe(originalPushState)
            expect(history.replaceState).toBe(originalReplaceState)

            integration.onRouterTransitionStart('/orders/123?token=secret', 'push')
            await integration.client.flush()
            await integration.client.shutdown()

            const body = (await collectorRequests.at(0)?.json()) as BrowserIngestRequest
            const navigationEvents = body.events.filter(event => event.event_type === 'navigation')
            const navigationSpans = body.spans.filter(span => span.span_category === 'navigation' && span.route === '/orders/:id')

            expect(navigationEvents).toHaveLength(1)
            expect(navigationEvents.at(0)).toMatchObject({
                name: 'push',
                page_url: 'https://shop.example.com/orders/:id',
                route: '/orders/:id',
            })
            expect(navigationSpans).toHaveLength(1)
            expect(JSON.stringify(body)).not.toContain('secret')
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
