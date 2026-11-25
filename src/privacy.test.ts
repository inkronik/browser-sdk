/* eslint-disable functional/immutable-data -- Synthetic browser globals and transport captures are external test APIs. */
import { describe, expect, test } from 'bun:test'
import { InkronikBrowserClient } from './client.js'
import { FakeXhr, installBrowserGlobals } from './testing/browser.js'
import { createSyntheticJwt } from './testing/jwt.js'
import type { BrowserFetch, BrowserIngestRequest } from './types.js'

describe('default Browser SDK JWT privacy at the transport boundary', () => {
    test.each(['receipt', 'sales-session-report'])(
        'redacts %s tokens for initial views, navigation, Fetch and XHR without changing wire URLs',
        async route => {
            const token = createSyntheticJwt(800)
            const encodedToken = Array.from(token, character => `%${character.charCodeAt(0).toString(16)}`).join('')
            const batches: Array<BrowserIngestRequest> = []
            const apiUrls: Array<string> = []
            const fetchImpl: BrowserFetch = async (input, init) => {
                const request = new Request(input, init)
                if (new URL(request.url).origin === 'https://collector.example.com') batches.push((await request.json()) as BrowserIngestRequest)
                else apiUrls.push(request.url)
                return new Response(null, { status: 202 })
            }
            const { windowValue, restore } = installBrowserGlobals(fetchImpl, () => 10)
            windowValue.location.href = `https://app.example.com/${route}/${token}`
            windowValue.location.pathname = `/${route}/${token}`
            const client = new InkronikBrowserClient({
                publicKey: 'test',
                collectorUrl: 'https://collector.example.com',
                environment: 'development',
                tracePropagationOrigins: ['https://api.example.com'],
                flushIntervalMs: 60_000,
            })
            try {
                await windowValue.fetch(`https://api.example.com/${route}/${token}`)
                const firstXhr = new FakeXhr()
                firstXhr.open('GET', `https://api.example.com/${route}/${token}`)
                firstXhr.send(undefined)
                firstXhr.finish(200)

                windowValue.location.href = `https://app.example.com/${route}/${encodedToken}`
                windowValue.location.pathname = `/${route}/${encodedToken}`
                client.captureNavigation({ navigationType: 'push', url: windowValue.location.href })
                await windowValue.fetch(`https://api.example.com/${route}/${encodedToken}`)
                const secondXhr = new FakeXhr()
                secondXhr.open('GET', `https://api.example.com/${route}/${encodedToken}`)
                secondXhr.send(undefined)
                secondXhr.finish(200)
                await client.flush()

                const spans = batches.flatMap(batch => batch.spans)
                const events = batches.flatMap(batch => batch.events)
                expect(spans.filter(span => span.span_kind === 'client')).toHaveLength(4)
                expect(spans.filter(span => span.span_category === 'navigation')).toHaveLength(2)
                expect(events.map(event => event.event_type)).toEqual(['page_view', 'navigation'])
                ;[...events, ...spans].forEach(item => {
                    expect(item.page_url).toBe(`https://app.example.com/${route}/:redacted`)
                    expect(item.route).toBe(`/${route}/:redacted`)
                })
                spans
                    .filter(item => item.span_kind === 'client')
                    .forEach(span => {
                        expect(span.http_url).toBe(`https://api.example.com/${route}/:redacted`)
                        expect(span.name).toBe(`GET /${route}/:redacted`)
                    })
                const serialized = JSON.stringify(batches)
                expect(serialized).not.toContain(token.slice(0, 40))
                expect(serialized).not.toContain(encodedToken.slice(0, 40))
                expect(apiUrls).toEqual([`https://api.example.com/${route}/${token}`, `https://api.example.com/${route}/${encodedToken}`])
                expect(firstXhr.url).toBe(`https://api.example.com/${route}/${token}`)
                expect(secondXhr.url).toBe(`https://api.example.com/${route}/${encodedToken}`)
                expect(firstXhr.headers.has('traceparent')).toBe(true)
                expect(secondXhr.headers.has('traceparent')).toBe(true)
            } finally {
                await client.shutdown()
                restore()
            }
        },
    )
})
