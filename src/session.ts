import { BROWSER_SESSION_STORAGE_KEY, DEFAULT_SESSION_INACTIVITY_MS, DEFAULT_SESSION_MAX_DURATION_MS } from './constants.js'
import type { BrowserSessionRecord, CanReuseBrowserSessionInput, ResolveBrowserSessionInput, ResolvedBrowserSession } from './types.js'
import { createUuid } from './utils.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

const readSession = (storage: Storage | null): BrowserSessionRecord | null => {
    if (storage === null) {
        return null
    }

    try {
        const value = storage.getItem(BROWSER_SESSION_STORAGE_KEY)

        if (value === null) {
            return null
        }

        const parsed = JSON.parse(value) as Partial<BrowserSessionRecord>
        const isValid =
            typeof parsed.id === 'string' &&
            UUID_PATTERN.test(parsed.id) &&
            typeof parsed.startedAt === 'number' &&
            Number.isFinite(parsed.startedAt) &&
            typeof parsed.lastActivityAt === 'number' &&
            Number.isFinite(parsed.lastActivityAt)

        return isValid ? (parsed as BrowserSessionRecord) : null
    } catch {
        return null
    }
}

const writeSession = ({ record, storage }: { readonly record: BrowserSessionRecord; readonly storage: Storage | null }): void => {
    if (storage === null) {
        return
    }

    try {
        storage.setItem(BROWSER_SESSION_STORAGE_KEY, JSON.stringify(record))
    } catch {
        // Storage can be unavailable in privacy modes. The in-memory session remains valid.
    }
}

const canReuseSession = ({ inactivityMs, maxDurationMs, now, record }: CanReuseBrowserSessionInput): boolean =>
    now >= record.lastActivityAt && now - record.lastActivityAt <= inactivityMs && now - record.startedAt <= maxDurationMs

export const resolveBrowserStorage = (environmentWindow: Window | null): Storage | null => {
    if (environmentWindow === null) {
        return null
    }

    try {
        return environmentWindow.localStorage
    } catch {
        return null
    }
}

export const resolveBrowserSession = ({
    storage,
    now = Date.now(),
    inactivityMs = DEFAULT_SESSION_INACTIVITY_MS,
    maxDurationMs = DEFAULT_SESSION_MAX_DURATION_MS,
}: ResolveBrowserSessionInput): ResolvedBrowserSession => {
    const existing = readSession(storage)
    const initialRecord: BrowserSessionRecord =
        existing !== null && canReuseSession({ record: existing, now, inactivityMs, maxDurationMs })
            ? existing
            : { id: createUuid(), startedAt: now, lastActivityAt: now }
    const state = { record: initialRecord }
    const persistActivity = (): string => {
        const activityAt = Date.now()
        const nextRecord = canReuseSession({ record: state.record, now: activityAt, inactivityMs, maxDurationMs })
            ? { ...state.record, lastActivityAt: activityAt }
            : { id: createUuid(), startedAt: activityAt, lastActivityAt: activityAt }

        // eslint-disable-next-line functional/immutable-data -- Browser-session lifecycle state rotates after inactivity.
        state.record = nextRecord
        writeSession({ record: nextRecord, storage })

        return nextRecord.id
    }

    writeSession({ record: initialRecord, storage })

    return { currentId: () => state.record.id, touch: persistActivity }
}
