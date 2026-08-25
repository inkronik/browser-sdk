import { describe, expect, test } from 'bun:test'
import {
    buildBrowserEvent,
    deterministicSample,
    normalizeBrowserUserContext,
    normalizeCapturedBrowserError,
    normalizeCollectorUrl,
    normalizeTelemetryEnvironment,
    shouldTraceBrowserRequest,
} from './utils.js'

describe('browser SDK event construction', () => {
    test('normalizes a deployment environment to its canonical telemetry slug', () => {
        expect(normalizeTelemetryEnvironment(' Development ')).toBe('development')
        expect(() => normalizeTelemetryEnvironment('production/eu')).toThrow(TypeError)
        expect(() => normalizeTelemetryEnvironment('')).toThrow(TypeError)
    })

    test('normalizes collector URLs without regex backtracking', () => {
        expect(normalizeCollectorUrl('https://collector.inkronik.example///')).toBe('https://collector.inkronik.example')
        expect(normalizeCollectorUrl('https://collector.inkronik.example/path//')).toBe('https://collector.inkronik.example/path')
        expect(normalizeCollectorUrl('https://collector.inkronik.example/path')).toBe('https://collector.inkronik.example/path')
        expect(normalizeCollectorUrl('/'.repeat(100_000))).toBe('')
    })

    test('sanitizes explicit identity, route, and custom attributes before transport', () => {
        const event = buildBrowserEvent({
            eventType: 'custom',
            name: 'checkout_started',
            pageUrl: 'https://shop.example.com/checkout',
            route: '/checkout?token=ROUTE_CANARY',
            sessionId: '80aa2bc2-2176-4d52-9bbb-4f6f1def1929',
            viewId: 'a1ad65a8-0a41-4a42-a9f6-fdd022a8aa85',
            userId: 'person@example.com',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            defaultAttributes: {},
            attributes: {
                input_value: 'FORM_CANARY',
                safe: 'visible',
            },
        })
        const serialized = JSON.stringify(event)

        expect(event.route).toBe('/checkout')
        expect(event.level).toBe('info')
        expect(event.message).toBe('')
        expect(event.user_id).toBe('[REDACTED]')
        expect(event.attributes.input_value).toBe('[REDACTED]')
        expect(serialized).not.toContain('ROUTE_CANARY')
        expect(serialized).not.toContain('FORM_CANARY')
        expect(serialized).not.toContain('person@example.com')
    })

    test('normalizes handled errors without copying arbitrary properties', () => {
        const error = Object.assign(new Error('Payment token=SECRET failed for person@example.com'), {
            code: 'PAYMENT_TIMEOUT',
            providerResponse: 'must-not-be-captured',
        })
        const normalized = normalizeCapturedBrowserError(error)

        expect(normalized).toMatchObject({
            type: 'Error',
            message: 'Payment token=[REDACTED] failed for [REDACTED]',
            code: 'PAYMENT_TIMEOUT',
            handled: true,
        })
        expect(normalized.stack).toContain('Error: Payment token=[REDACTED] failed for [REDACTED]')
        expect(JSON.stringify(normalized)).not.toContain('must-not-be-captured')
        expect(JSON.stringify(normalized)).not.toContain('SECRET')
        expect(JSON.stringify(normalized)).not.toContain('person@example.com')
    })

    test('samples deterministically per anonymous session', () => {
        const input = { sampleRate: 0.5, sessionId: '80aa2bc2-2176-4d52-9bbb-4f6f1def1929' }

        expect(deterministicSample(input)).toBe(deterministicSample(input))
        expect(deterministicSample({ ...input, sampleRate: 0 })).toBe(false)
        expect(deterministicSample({ ...input, sampleRate: 1 })).toBe(true)
    })

    test('normalizes user context into privacy-safe namespaced attributes', () => {
        const context = normalizeBrowserUserContext({
            id: 'user_42',
            attributes: {
                role: 'admin',
                tenant_id: 'tenant_7',
                email: 'person@example.com',
                input_value: 'FORM_CANARY',
            },
        })

        expect(context.id).toBe('user_42')
        expect(context.attributes['user.role']).toBe('admin')
        expect(context.attributes['user.tenant_id']).toBe('tenant_7')
        expect(context.attributes['user.email']).toBe('[REDACTED]')
        expect(context.attributes['user.input_value']).toBe('[REDACTED]')
        expect(JSON.stringify(context)).not.toContain('person@example.com')
        expect(JSON.stringify(context)).not.toContain('FORM_CANARY')
    })

    test('propagates only to exact configured origins and never to browser ingest', () => {
        const input = {
            collectorUrl: 'https://collector.inkronik.example',
            tracePropagationOrigins: new Set(['https://app.example.com', 'https://api.example.com']),
        }

        expect(shouldTraceBrowserRequest({ ...input, requestUrl: new URL('https://api.example.com/orders?token=secret') })).toBe(true)
        expect(shouldTraceBrowserRequest({ ...input, requestUrl: new URL('https://evil.example.com/orders') })).toBe(false)
        expect(shouldTraceBrowserRequest({ ...input, requestUrl: new URL('https://collector.inkronik.example/v1/browser') })).toBe(false)
        expect(
            shouldTraceBrowserRequest({
                ...input,
                collectorUrl: 'https://collector.inkronik.example///',
                requestUrl: new URL('https://collector.inkronik.example/v1/browser'),
            }),
        ).toBe(false)
    })
})
