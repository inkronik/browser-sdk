import {
    CARD_PATTERN,
    EMAIL_PATTERN,
    MAX_ATTRIBUTES,
    MAX_ATTRIBUTE_KEY_LENGTH,
    MAX_ATTRIBUTE_VALUE_LENGTH,
    PHONE_PATTERN,
    REDACTED_VALUE,
    ROUTE_NUMERIC_SEGMENT_PATTERN,
    ROUTE_OBJECT_ID_SEGMENT_PATTERN,
    ROUTE_ULID_SEGMENT_PATTERN,
    ROUTE_UUID_SEGMENT_PATTERN,
    SENSITIVE_KEY_FRAGMENTS,
    TOKEN_PATTERN,
} from './constants.js'
import type { BrowserAttributeValue } from './protocol/types.js'
import type { BrowserAttributes } from './types.js'

const normalizeKey = (value: string): string => value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')
const freeformSecretPattern =
    /((?:password|passwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|id[_-]?token|jwt|credential|signature|session|cookie|card[_-]?number|credit[_-]?card|cvv|cvc|ssn)\s*[:=]\s*)([^&\s,"'}]+)/gi

export const isSensitiveBrowserKey = (key: string): boolean => {
    const normalized = normalizeKey(key)

    return SENSITIVE_KEY_FRAGMENTS.some(fragment => normalized.includes(fragment))
}

export const redactBrowserValue = (value: string): string =>
    value
        .replaceAll(TOKEN_PATTERN, REDACTED_VALUE)
        .replaceAll(EMAIL_PATTERN, REDACTED_VALUE)
        .replaceAll(PHONE_PATTERN, REDACTED_VALUE)
        .replaceAll(CARD_PATTERN, REDACTED_VALUE)

export const redactBrowserErrorValue = (value: string): string => redactBrowserValue(value).replaceAll(freeformSecretPattern, `$1${REDACTED_VALUE}`)

const sanitizeValue = ({ key, value }: { readonly key: string; readonly value: BrowserAttributeValue }): BrowserAttributeValue => {
    const isFreeformErrorValue = key === 'message' || key === 'stack' || key === 'reason'

    if (isSensitiveBrowserKey(key) || isFreeformErrorValue) {
        return REDACTED_VALUE
    }

    if (typeof value !== 'string') {
        return value
    }

    const isUrlValue = key === 'file' || key === 'url' || key.endsWith('_url')

    if (isUrlValue) {
        try {
            return sanitizeBrowserUrl(value).slice(0, MAX_ATTRIBUTE_VALUE_LENGTH)
        } catch {
            return REDACTED_VALUE
        }
    }

    return redactBrowserValue(value.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH))
}

export const sanitizeBrowserAttributes = (attributes: BrowserAttributes): BrowserAttributes =>
    Object.fromEntries(
        Object.entries(attributes)
            .slice(0, MAX_ATTRIBUTES)
            .filter(([key]) => key.length <= MAX_ATTRIBUTE_KEY_LENGTH)
            .map(([key, value]) => [key, sanitizeValue({ key, value })]),
    )

export const sanitizeBrowserUrl = (value: string): string => {
    const parsed = new URL(value)

    return `${parsed.origin}${sanitizeBrowserRoute(parsed.pathname)}`
}

const isIdentifierRouteSegment = (segment: string): boolean =>
    ROUTE_UUID_SEGMENT_PATTERN.test(segment) ||
    ROUTE_ULID_SEGMENT_PATTERN.test(segment) ||
    ROUTE_OBJECT_ID_SEGMENT_PATTERN.test(segment) ||
    ROUTE_NUMERIC_SEGMENT_PATTERN.test(segment)

export const sanitizeBrowserRoute = (value: string): string => {
    const path = value.split(/[?#]/u).at(0)?.slice(0, 500) ?? ''

    return path
        .split('/')
        .map(segment => (isIdentifierRouteSegment(segment) ? ':id' : segment))
        .join('/')
}
