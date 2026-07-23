import { describe, expect, mock, test } from 'bun:test'
import type { BrowserFetch } from './types.js'
import { sendBrowserBatch } from './transport.js'

describe('browser transport', () => {
    test('sends mixed event and span batches through the public browser endpoint', async () => {
        const requests: Array<Request> = []
        const fetchImpl = mock<BrowserFetch>((input: RequestInfo | URL, init?: RequestInit) => {
            // eslint-disable-next-line functional/immutable-data -- Capturing a request is required by this transport mock.
            requests.push(new Request(input, init))

            return Promise.resolve(new Response(null, { status: 202 }))
        })
        const result = await sendBrowserBatch({
            collectorUrl: 'https://collector.inkronik.example',
            publicKey: `ik_pub_${'a'.repeat(43)}`,
            events: [],
            spans: [
                {
                    trace_id: 'a'.repeat(32),
                    span_id: 'b'.repeat(16),
                    parent_span_id: 'c'.repeat(16),
                    name: 'GET /orders',
                    timestamp: '2026-07-16T12:00:00.000Z',
                    end_time: '2026-07-16T12:00:00.010Z',
                    duration_us: 10_000,
                    span_kind: 'client',
                    span_category: 'http',
                    status_code: 'ok',
                    status_message: '',
                    session_id: 'a19b8556-50af-453a-a23a-42fb6184d923',
                    view_id: '3122bb46-332a-484b-b256-7165280e8298',
                    page_url: 'https://app.example.com/orders',
                    route: '/orders',
                    user_id: 'user_42',
                    http_method: 'GET',
                    http_url: 'https://api.example.com/orders',
                    http_status_code: 200,
                    attributes: {},
                },
            ],
            useBeacon: false,
            fetchImpl,
            maxRetries: 0,
            onError: () => undefined,
        })
        const request = requests.at(0)
        const body = request === undefined ? null : await request.json()

        expect(result.delivered).toBe(true)
        expect(request?.url).toBe('https://collector.inkronik.example/v1/browser')
        expect(request?.headers.get('content-type')).toBe('application/json')
        expect(body).toMatchObject({
            public_key: `ik_pub_${'a'.repeat(43)}`,
            events: [],
            spans: [{ trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), parent_span_id: 'c'.repeat(16) }],
        })
    })
})
