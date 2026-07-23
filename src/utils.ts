import type { BrowserEvent, BrowserSpan } from './protocol/types.js'
import { redactBrowserValue, sanitizeBrowserAttributes, sanitizeBrowserRoute, sanitizeBrowserUrl } from './sanitizer.js'
import type {
    BuildBrowserEventInput,
    BuildBrowserSpanInput,
    BrowserEnvironment,
    BrowserFetch,
    NormalizedBrowserUserContext,
    ResolveBrowserFetchInput,
    ResolveTracePropagationOriginsInput,
    SetUserInput,
    ShouldTraceBrowserRequestInput,
} from './types.js'

export const createUuid = (): string => crypto.randomUUID()

export const normalizeCollectorUrl = (value: string): string => value.replace(/\/+$/u, '')

export const resolveTracePropagationOrigins = ({ environment, configuredOrigins }: ResolveTracePropagationOriginsInput): ReadonlySet<string> =>
    new Set([...(environment === null ? [] : [environment.location.origin]), ...(configuredOrigins ?? []).map(origin => new URL(origin).origin)])

export const shouldTraceBrowserRequest = ({ collectorUrl, requestUrl, tracePropagationOrigins }: ShouldTraceBrowserRequestInput): boolean => {
    const collector = new URL(collectorUrl)
    const collectorPath = collector.pathname.replace(/\/+$/u, '')
    const isCollectorRequest = requestUrl.origin === collector.origin && requestUrl.pathname.startsWith(`${collectorPath}/v1/browser`)

    return !isCollectorRequest && tracePropagationOrigins.has(requestUrl.origin)
}

export const resolveBrowserEnvironment = (): BrowserEnvironment | null => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') {
        return null
    }

    return { window, document, navigator, history: window.history, location: window.location, performance: window.performance }
}

export const resolveBrowserFetch = ({ configuredFetch, environment }: ResolveBrowserFetchInput): BrowserFetch => {
    if (configuredFetch !== undefined) {
        return configuredFetch.bind(environment?.window ?? globalThis)
    }

    if (environment !== null) {
        return environment.window.fetch.bind(environment.window)
    }

    return globalThis.fetch.bind(globalThis)
}

export const normalizeBrowserUserContext = (input: SetUserInput): NormalizedBrowserUserContext => ({
    id: redactBrowserValue(input.id.slice(0, 255)),
    attributes: sanitizeBrowserAttributes(Object.fromEntries(Object.entries(input.attributes ?? {}).map(([key, value]) => [`user.${key}`, value]))),
})

export const deterministicSample = ({ sampleRate, sessionId }: { readonly sampleRate: number; readonly sessionId: string }): boolean => {
    const normalizedRate = Math.min(1, Math.max(0, sampleRate))
    const hash = Array.from(sessionId).reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 4_294_967_296, 2_166_136_261)

    return hash / 0xffffffff <= normalizedRate
}

export const buildBrowserEvent = ({
    attributes,
    defaultAttributes,
    eventType,
    measurements,
    name,
    pageUrl,
    route,
    sessionId,
    userId,
    viewId,
    traceId,
    spanId,
}: BuildBrowserEventInput): BrowserEvent => ({
    event_id: createUuid(),
    event_type: eventType,
    name: name.slice(0, 100),
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    view_id: viewId,
    page_url: pageUrl,
    route: sanitizeBrowserRoute(route),
    user_id: redactBrowserValue(userId.slice(0, 255)),
    trace_id: traceId,
    span_id: spanId,
    attributes: sanitizeBrowserAttributes({ ...defaultAttributes, ...attributes }),
    measurements: Object.fromEntries(
        Object.entries(measurements ?? {})
            .filter(([, value]) => Number.isFinite(value))
            .slice(0, 16),
    ),
})

export const buildBrowserSpan = ({
    attributes,
    context,
    durationUs,
    endTime,
    httpMethod,
    httpStatusCode,
    httpUrl,
    name,
    pageUrl,
    route,
    sessionId,
    spanCategory,
    spanKind,
    statusCode,
    statusMessage,
    timestamp,
    userId,
    viewId,
}: BuildBrowserSpanInput): BrowserSpan => ({
    trace_id: context.traceId,
    span_id: context.spanId,
    parent_span_id: context.parentSpanId,
    name: redactBrowserValue(name.slice(0, 100)),
    timestamp,
    end_time: endTime,
    duration_us: Math.max(0, Math.round(durationUs)),
    span_kind: spanKind,
    span_category: spanCategory,
    status_code: statusCode,
    status_message: statusMessage === undefined ? '' : redactBrowserValue(statusMessage.slice(0, 512)),
    session_id: sessionId,
    view_id: viewId,
    page_url: pageUrl,
    route: sanitizeBrowserRoute(route),
    user_id: redactBrowserValue(userId.slice(0, 255)),
    http_method: httpMethod?.slice(0, 16) ?? '',
    http_url: httpUrl === undefined ? '' : sanitizeBrowserUrl(httpUrl),
    http_status_code: httpStatusCode ?? 0,
    attributes: sanitizeBrowserAttributes(attributes ?? {}),
})
