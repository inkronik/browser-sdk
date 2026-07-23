/* eslint-disable functional/immutable-data -- The Storage test double must implement the browser's mutable Storage API. */
import { describe, expect, test } from 'bun:test'
import { BROWSER_SESSION_STORAGE_KEY, DEFAULT_SESSION_MAX_DURATION_MS } from './constants.js'
import { resolveBrowserSession } from './session.js'

const createStorage = (initialValue: string | null = null): Storage => {
    const values = new Map<string, string>(initialValue === null ? [] : [[BROWSER_SESSION_STORAGE_KEY, initialValue]])

    return {
        get length() {
            return values.size
        },
        clear: () => values.clear(),
        getItem: key => values.get(key) ?? null,
        key: index => Array.from(values.keys()).at(index) ?? null,
        removeItem: key => values.delete(key),
        setItem: (key, value) => values.set(key, value),
    }
}

describe('browser session lifecycle', () => {
    test('reuses an anonymous session across SDK instances while activity remains fresh', () => {
        const storage = createStorage()
        const first = resolveBrowserSession({ storage, now: 1_000 })
        const second = resolveBrowserSession({ storage, now: 2_000 })

        expect(second.currentId()).toBe(first.currentId())
    })

    test('starts a new session after inactivity or the absolute lifetime', () => {
        const storage = createStorage()
        const first = resolveBrowserSession({ storage, now: 1_000, inactivityMs: 100, maxDurationMs: 1_000 })
        const afterInactivity = resolveBrowserSession({ storage, now: 1_101, inactivityMs: 100, maxDurationMs: 1_000 })
        const afterLifetime = resolveBrowserSession({ storage, now: 2_102, inactivityMs: 5_000, maxDurationMs: 1_000 })

        expect(afterInactivity.currentId()).not.toBe(first.currentId())
        expect(afterLifetime.currentId()).not.toBe(afterInactivity.currentId())
    })

    test('caps active browser sessions at thirty minutes', () => {
        const storage = createStorage()
        const first = resolveBrowserSession({ storage, now: 1_000 })
        const insideLimit = resolveBrowserSession({ storage, now: 1_000 + DEFAULT_SESSION_MAX_DURATION_MS })
        const afterLimit = resolveBrowserSession({ storage, now: 1_001 + DEFAULT_SESSION_MAX_DURATION_MS })

        expect(DEFAULT_SESSION_MAX_DURATION_MS).toBe(30 * 60 * 1000)
        expect(insideLimit.currentId()).toBe(first.currentId())
        expect(afterLimit.currentId()).not.toBe(first.currentId())
    })

    test('falls back to an in-memory session when storage is unavailable', () => {
        const storage = {
            getItem: () => {
                throw new Error('blocked')
            },
            setItem: () => {
                throw new Error('blocked')
            },
        } as unknown as Storage
        const session = resolveBrowserSession({ storage, now: 1_000 })

        expect(session.currentId()).toMatch(/^[0-9a-f-]{36}$/u)
        expect(() => session.touch()).not.toThrow()
    })
})
