import { describe, expect, test } from 'bun:test'
import { createRootBrowserTraceContext, toBrowserTraceparent } from './trace-context.js'

describe('browser trace context', () => {
    test('creates independent W3C-compatible root identifiers', () => {
        const first = createRootBrowserTraceContext()
        const second = createRootBrowserTraceContext()

        expect(first.traceId).toMatch(/^[0-9a-f]{32}$/u)
        expect(first.spanId).toMatch(/^[0-9a-f]{16}$/u)
        expect(first.parentSpanId).toBe('')
        expect(second.traceId).not.toBe(first.traceId)
        expect(second.spanId).not.toBe(first.spanId)
        expect(second.parentSpanId).toBe('')
        expect(toBrowserTraceparent(first)).toBe(`00-${first.traceId}-${first.spanId}-01`)
    })
})
