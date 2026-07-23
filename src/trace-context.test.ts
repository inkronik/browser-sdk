import { describe, expect, test } from 'bun:test'
import { createChildBrowserTraceContext, createRootBrowserTraceContext, toBrowserTraceparent } from './trace-context.js'

describe('browser trace context', () => {
    test('creates W3C-compatible root and child identifiers', () => {
        const root = createRootBrowserTraceContext()
        const child = createChildBrowserTraceContext(root)

        expect(root.traceId).toMatch(/^[0-9a-f]{32}$/u)
        expect(root.spanId).toMatch(/^[0-9a-f]{16}$/u)
        expect(root.parentSpanId).toBe('')
        expect(child.traceId).toBe(root.traceId)
        expect(child.spanId).toMatch(/^[0-9a-f]{16}$/u)
        expect(child.parentSpanId).toBe(root.spanId)
        expect(toBrowserTraceparent(child)).toBe(`00-${root.traceId}-${child.spanId}-01`)
    })
})
