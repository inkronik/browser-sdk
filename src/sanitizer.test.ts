import { describe, expect, mock, test } from 'bun:test'
import { createPrivacyPreservingUrlSanitizer, sanitizeBrowserAttributes, sanitizeBrowserRoute, sanitizeBrowserUrl } from './sanitizer.js'
import { createSyntheticJwt } from './testing/jwt.js'

describe('browser SDK sanitization', () => {
    test.each([0, 800, 4000])('redacts entire JWT path segments before applying the route limit: padding=%i', padding => {
        const token = createSyntheticJwt(padding)
        ;['receipt', 'sales-session-report'].forEach(route => {
            const path = `/${route}/${token}/download`
            expect(sanitizeBrowserRoute(path)).toBe(`/${route}/:redacted/download`)
            expect(sanitizeBrowserUrl(`https://app.example.com${path}?token=QUERY_SECRET#private`)).toBe(
                `https://app.example.com/${route}/:redacted/download`,
            )
        })
    })

    test('redacts encoded JWT segments, including nested encoding, without decoding ordinary route labels', () => {
        const token = createSyntheticJwt(0)
        const encoded = Array.from(token, character => `%${character.charCodeAt(0).toString(16)}`).join('')
        const nested = encoded.replaceAll('%', '%25')
        ;[encoded, nested, nested.replaceAll('%', '%252525')].forEach(value => {
            expect(sanitizeBrowserRoute(`/receipt/${value}`)).toBe('/receipt/:redacted')
        })
        expect(sanitizeBrowserRoute('/teams/platform%20engineering/v1.2.3')).toBe('/teams/platform%20engineering/v1.2.3')
        expect(sanitizeBrowserRoute(`/receipt/${token}%ZZ`)).toBe('/receipt/:redacted')
    })

    test('recognizes JWT JSON headers without relying on the eyJ prefix and masks unsigned tokens', () => {
        const token = `${btoa(' { "alg": "none" }').replaceAll('=', '')}.e30.`
        expect(sanitizeBrowserRoute(`/receipt/${token}`)).toBe('/receipt/:redacted')
        expect(sanitizeBrowserRoute('/releases/v1.2.3')).toBe('/releases/v1.2.3')
    })

    test('omits oversized values instead of scanning unbounded text or exposing a truncated token', () => {
        const token = createSyntheticJwt(20_000)
        expect(sanitizeBrowserRoute(`/receipt/${token}/download`)).toBe('/receipt/:redacted/download')
        expect(sanitizeBrowserAttributes({ operation: token })).toEqual({ operation: '[REDACTED]' })
    })

    test('a custom sanitizer receives redacted paths and cannot reintroduce a token', () => {
        const token = createSyntheticJwt(0)
        const customSanitizer = mock((url: URL) => `${url.origin}/sales-session-report/${token}`)
        const sanitizeUrl = createPrivacyPreservingUrlSanitizer(customSanitizer)
        expect(sanitizeUrl(new URL(`https://app.example.com/receipt/${token}`))).toBe('https://app.example.com/sales-session-report/:redacted')
        expect(customSanitizer.mock.calls.at(0)?.at(0)?.pathname).toBe('/receipt/:redacted')
    })

    test('redacts values before their length limit can split a token', () => {
        const token = createSyntheticJwt(800)
        expect(sanitizeBrowserAttributes({ operation: `GET /receipt/${token}`, target_url: `https://app.example.com/receipt/${token}` })).toEqual({
            operation: 'GET /receipt/[REDACTED]',
            target_url: 'https://app.example.com/receipt/:redacted',
        })
    })
    test('never forwards input-like or secret attributes', () => {
        const sanitized = sanitizeBrowserAttributes({
            input_value: 'FORM_SECRET',
            password: 'PASSWORD_SECRET',
            email: 'person@example.com',
            safe: 'visible',
            message: 'Contact person@example.com with Bearer eyJabc.def.ghi',
            checkout_url: 'https://shop.example.com/checkout?input=FORM_URL_SECRET#fragment',
        })
        const serialized = JSON.stringify(sanitized)

        expect(serialized).not.toContain('FORM_SECRET')
        expect(serialized).not.toContain('PASSWORD_SECRET')
        expect(serialized).not.toContain('person@example.com')
        expect(serialized).not.toContain('eyJabc.def.ghi')
        expect(serialized).not.toContain('Contact')
        expect(sanitized.message).toBe('[REDACTED]')
        expect(sanitized.checkout_url).toBe('https://shop.example.com/checkout')
        expect(sanitized.safe).toBe('visible')
    })

    test('drops URL credentials, query strings, and fragments', () => {
        expect(sanitizeBrowserUrl('https://user:secret@example.com/checkout?token=secret#person@example.com')).toBe('https://example.com/checkout')
    })

    test('enforces baseline privacy before invoking custom URL sanitization', () => {
        const customSanitizer = mock((url: URL) => url.toString())
        const sanitizeUrl = createPrivacyPreservingUrlSanitizer(customSanitizer)

        expect(sanitizeUrl(new URL('https://user:password@example.com/reset-password?token=SECRET#private'))).toBe(
            'https://example.com/reset-password',
        )
        expect(customSanitizer.mock.calls.at(0)?.at(0)?.toString()).toBe('https://example.com/reset-password')
    })

    test('prevents custom URL sanitization from reintroducing sensitive URL components', () => {
        const sanitizeUrl = createPrivacyPreservingUrlSanitizer(() => 'https://user:password@example.com/reset-password?token=reintroduced#private')

        expect(sanitizeUrl(new URL('https://example.com/reset-password'))).toBe('https://example.com/reset-password')
    })

    test('allows custom URL sanitization to increase path privacy', () => {
        const sanitizeUrl = createPrivacyPreservingUrlSanitizer(url => url.toString().replace('/users/alice/', '/users/redacted/'))

        expect(sanitizeUrl(new URL('https://example.com/users/alice/profile?token=SECRET'))).toBe('https://example.com/users/redacted/profile')
    })

    test('fails closed when custom URL sanitization throws or returns an unsafe value', () => {
        const url = new URL('https://example.com/reset-password?token=SECRET')
        const throwingSanitizer = createPrivacyPreservingUrlSanitizer(() => {
            throw new Error('custom sanitizer failed')
        })

        expect(throwingSanitizer(url)).toBe('')
        expect(createPrivacyPreservingUrlSanitizer(() => '')(url)).toBe('')
        expect(createPrivacyPreservingUrlSanitizer(() => 'not a URL')(url)).toBe('')
        expect(createPrivacyPreservingUrlSanitizer(() => 'data:text/plain,SECRET')(url)).toBe('')
    })

    test('omits non-HTTP URLs instead of exposing opaque payloads', () => {
        expect(() => sanitizeBrowserUrl('not a URL')).toThrow()
        expect(sanitizeBrowserUrl('file:///Users/person/private.txt')).toBe('')
        expect(sanitizeBrowserUrl('data:text/plain,SECRET')).toBe('')
        expect(sanitizeBrowserUrl('javascript:SECRET')).toBe('')
    })

    test('normalizes identifier route segments without collapsing semantic slugs', () => {
        expect(sanitizeBrowserRoute('/users/550e8400-e29b-41d4-a716-446655440000/orders/42?secret=value')).toBe('/users/:id/orders/:id')
        expect(sanitizeBrowserRoute('/events/01J0M6YJ4JAB3N7Q4Z7G2Q1H8K')).toBe('/events/:id')
        expect(sanitizeBrowserRoute('/documents/507f1f77bcf86cd799439011')).toBe('/documents/:id')
        expect(sanitizeBrowserRoute('/teams/platform-engineering')).toBe('/teams/platform-engineering')
        expect(sanitizeBrowserRoute('/')).toBe('/')
        expect(sanitizeBrowserUrl('https://example.com/users/550e8400-e29b-41d4-a716-446655440000?token=secret')).toBe(
            'https://example.com/users/:id',
        )
    })
})
