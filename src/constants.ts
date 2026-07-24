export const DEFAULT_BATCH_SIZE = 20
export const DEFAULT_MAX_QUEUE_SIZE = 200
export const DEFAULT_FLUSH_INTERVAL_MS = 5000
export const DEFAULT_MAX_RETRIES = 2
export const DEFAULT_RETRY_BASE_MS = 250
export const DEFAULT_SAMPLE_RATE = 1
export const SDK_NAME = '@inkronik/browser-sdk'
export const SDK_VERSION = '1.0.0'
export const DEFAULT_SESSION_INACTIVITY_MS = 30 * 60 * 1000
export const DEFAULT_SESSION_MAX_DURATION_MS = 30 * 60 * 1000
export const BROWSER_SESSION_STORAGE_KEY = 'inkronik.browser.session'
export const REDACTED_VALUE = '[REDACTED]'
export const MAX_ATTRIBUTES = 32
export const MAX_ATTRIBUTE_KEY_LENGTH = 64
export const MAX_ATTRIBUTE_VALUE_LENGTH = 512
export const MAX_ERROR_VALUE_LENGTH = 4096
export const INKRONIK_ORIGINAL_BROWSER_FETCH = Symbol.for('inkronik.browser.originalFetch')

export const SENSITIVE_KEY_FRAGMENTS = [
    'password',
    'passwd',
    'secret',
    'token',
    'authorization',
    'cookie',
    'api_key',
    'apikey',
    'credential',
    'session',
    'card',
    'cvv',
    'cvc',
    'email',
    'phone',
    'ssn',
    'input',
    'value',
] as const

export const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
export const PHONE_PATTERN = /\b(?:\+?\d[\d .()-]{7,}\d)\b/g
export const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g
export const TOKEN_PATTERN = /\b(?:Bearer\s+)?(?:ik_(?:live|pub)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g
export const ROUTE_UUID_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
export const ROUTE_ULID_SEGMENT_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/iu
export const ROUTE_OBJECT_ID_SEGMENT_PATTERN = /^[0-9a-f]{24}$/iu
export const ROUTE_NUMERIC_SEGMENT_PATTERN = /^\d+$/u
