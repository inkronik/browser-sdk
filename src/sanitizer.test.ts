import { describe, expect, test } from 'bun:test'
import { sanitizeBrowserAttributes, sanitizeBrowserRoute, sanitizeBrowserUrl } from './sanitizer.js'

describe('browser SDK sanitization', () => {
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
