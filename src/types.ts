import type { BrowserAttributeValue, BrowserEvent, BrowserEventType, BrowserIngestRequest, BrowserSpan, EventLevel } from './protocol/types.js'

export type { BrowserAttributeValue, BrowserEvent, BrowserEventType, BrowserIngestRequest, BrowserSpan, EventLevel } from './protocol/types.js'

export type BrowserAttributes = Readonly<Record<string, BrowserAttributeValue>>
export type BrowserFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type BrowserUrlSanitizer = (url: URL) => string

export interface CreateInkronikBrowserOptions {
    readonly publicKey: string
    readonly collectorUrl: string
    readonly environment: string
    readonly sampleRate?: number
    readonly defaultAttributes?: BrowserAttributes
    readonly maxBatchSize?: number
    readonly maxQueueSize?: number
    readonly flushIntervalMs?: number
    readonly maxRetries?: number
    readonly fetchImpl?: BrowserFetch
    readonly onError?: (error: Error) => void
    readonly getRoute?: () => string
    readonly sanitizeUrl?: BrowserUrlSanitizer
    readonly user?: SetUserInput
    readonly enableFetchTracing?: boolean
    readonly enableNavigationTracking?: boolean
    readonly tracePropagationOrigins?: ReadonlyArray<string>
}

export type BrowserNavigationType = 'push' | 'replace' | 'traverse'

export interface CaptureBrowserNavigationInput {
    readonly navigationType: BrowserNavigationType
    readonly url: string
}

export interface CaptureEventInput {
    readonly name: string
    readonly level?: EventLevel
    readonly message?: string
    readonly attributes?: BrowserAttributes
    readonly measurements?: Readonly<Record<string, number>>
}

export interface CaptureErrorOptions {
    readonly name: string
    readonly message?: string
    readonly attributes?: BrowserAttributes
    readonly measurements?: Readonly<Record<string, number>>
}

export interface CapturedError {
    readonly type: string
    readonly message: string
    readonly stack: string
    readonly code: string
    readonly handled: boolean
}

export interface SetUserInput {
    readonly id: string
    readonly attributes?: BrowserAttributes
}

export interface NormalizedBrowserUserContext {
    readonly id: string
    readonly attributes: BrowserAttributes
}

export interface EnqueueBrowserEventInput {
    readonly eventType: BrowserEventType
    readonly name: string
    readonly level?: EventLevel
    readonly message?: string
    readonly error?: CapturedError
    readonly attributes?: BrowserAttributes
    readonly measurements?: Readonly<Record<string, number>>
    readonly context?: BrowserEventContextOverride
}

export interface BrowserEventContextOverride {
    readonly pageUrl: string
    readonly route: string
}

export interface BrowserEnvironment {
    readonly document: Document
    readonly history: History
    readonly location: Location
    readonly navigator: Navigator
    readonly performance: Performance
    readonly window: Window
}

export interface ResolveBrowserFetchInput {
    readonly configuredFetch?: BrowserFetch
    readonly environment: BrowserEnvironment | null
}

export interface BrowserSessionRecord {
    readonly id: string
    readonly startedAt: number
    readonly lastActivityAt: number
}

export interface CanReuseBrowserSessionInput {
    readonly inactivityMs: number
    readonly maxDurationMs: number
    readonly now: number
    readonly record: BrowserSessionRecord
}

export interface ResolveBrowserSessionInput {
    readonly storage: Storage | null
    readonly now?: number
    readonly inactivityMs?: number
    readonly maxDurationMs?: number
}

export interface ResolvedBrowserSession {
    readonly currentId: () => string
    readonly touch: () => string
}

export interface BrowserTransportOptions {
    readonly collectorUrl: string
    readonly publicKey: string
    readonly environment: string
    readonly fetchImpl: BrowserFetch
    readonly maxRetries: number
    readonly onError: (error: Error) => void
}

export interface SendBrowserBatchInput extends BrowserTransportOptions {
    readonly events: ReadonlyArray<BrowserEvent>
    readonly spans: ReadonlyArray<BrowserSpan>
    readonly useBeacon: boolean
}

export interface BrowserTransportResult {
    readonly delivered: boolean
}

export interface BrowserQueueState {
    readonly items: ReadonlyArray<BrowserQueueItem>
    readonly flushing: Promise<void> | null
}

export interface BrowserEventQueueItem {
    readonly itemType: 'event'
    readonly event: BrowserEvent
}

export interface BrowserSpanQueueItem {
    readonly itemType: 'span'
    readonly span: BrowserSpan
}

export type BrowserQueueItem = BrowserEventQueueItem | BrowserSpanQueueItem

export interface BrowserTraceContext {
    readonly traceId: string
    readonly spanId: string
    readonly parentSpanId: string
}

export interface BrowserViewContext extends BrowserTraceContext {
    readonly viewId: string
}

export interface BrowserEventContext {
    readonly pageUrl: string
    readonly route: string
    readonly sessionId: string
    readonly viewId: string
    readonly userId: string
    readonly traceId: string
    readonly spanId: string
}

export interface BuildBrowserEventInput extends BrowserEventContext, EnqueueBrowserEventInput {
    readonly defaultAttributes: BrowserAttributes
}

export interface BrowserInstrumentationInput {
    readonly environment: BrowserEnvironment
    readonly capture: (input: EnqueueBrowserEventInput) => void
    readonly beginView: (name: string) => void
    readonly traceFetch: BrowserFetch
    readonly enableFetchTracing: boolean
    readonly enableNavigationTracking: boolean
}

export interface StartBrowserViewInput {
    readonly eventType: BrowserEventType
    readonly name: string
    readonly url?: string
}

export interface BuildBrowserSpanInput {
    readonly context: BrowserTraceContext
    readonly name: string
    readonly timestamp: string
    readonly endTime: string
    readonly durationUs: number
    readonly spanKind: BrowserSpan['span_kind']
    readonly spanCategory: BrowserSpan['span_category']
    readonly statusCode: BrowserSpan['status_code']
    readonly statusMessage?: string
    readonly sessionId: string
    readonly viewId: string
    readonly pageUrl: string
    readonly route: string
    readonly userId: string
    readonly httpMethod?: string
    readonly httpUrl?: string
    readonly httpStatusCode?: number
    readonly attributes?: BrowserAttributes
}

export interface CompleteBrowserFetchSpanInput {
    readonly context: BrowserTraceContext
    readonly viewContext: BrowserViewContext
    readonly request: Request
    readonly startedAt: number
    readonly timestamp: string
    readonly pageUrl: string
    readonly route: string
    readonly userId: string
    readonly sessionId: string
    readonly attributes: BrowserAttributes
    readonly response?: Response
    readonly error?: unknown
}

export interface BrowserTransportBatch {
    readonly events: ReadonlyArray<BrowserEvent>
    readonly spans: ReadonlyArray<BrowserSpan>
}

export interface ResolveTracePropagationOriginsInput {
    readonly environment: BrowserEnvironment | null
    readonly configuredOrigins?: ReadonlyArray<string>
}

export interface ShouldTraceBrowserRequestInput {
    readonly collectorUrl: string
    readonly requestUrl: URL
    readonly tracePropagationOrigins: ReadonlySet<string>
}

export interface LayoutShiftPerformanceEntry extends PerformanceEntry {
    readonly hadRecentInput: boolean
    readonly value: number
}

export interface InteractionPerformanceEntry extends PerformanceEntry {
    readonly interactionId: number
}

export type BrowserBatch = BrowserIngestRequest
