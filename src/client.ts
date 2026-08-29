/* eslint-disable functional/immutable-data -- The bounded in-memory SDK queue and lifecycle state are intentionally stateful. */
import {
    DEFAULT_BATCH_SIZE,
    DEFAULT_FLUSH_INTERVAL_MS,
    DEFAULT_MAX_QUEUE_SIZE,
    DEFAULT_MAX_RETRIES,
    DEFAULT_SAMPLE_RATE,
    SDK_NAME,
    SDK_VERSION,
} from './constants.js'
import { installBrowserInstrumentation } from './browser-instrumentation.js'
import type { BrowserSpan } from './protocol/types.js'
import { createPrivacyPreservingUrlSanitizer, sanitizeBrowserRoute } from './sanitizer.js'
import { resolveBrowserSession, resolveBrowserStorage } from './session.js'
import { createRootBrowserTraceContext, toBrowserTraceparent } from './trace-context.js'
import { sendBrowserBatch } from './transport.js'
import type {
    BrowserAttributes,
    BrowserFetch,
    BrowserQueueItem,
    BrowserTransportBatch,
    BrowserViewContext,
    CaptureBrowserNavigationInput,
    CaptureErrorOptions,
    CaptureEventInput,
    CompleteBrowserFetchSpanInput,
    CreateInkronikBrowserOptions,
    EnqueueBrowserEventInput,
    SetUserInput,
    StartBrowserViewInput,
} from './types.js'
import {
    buildBrowserEvent,
    buildBrowserSpan,
    createUuid,
    deterministicSample,
    normalizeBrowserUserContext,
    normalizeCapturedBrowserError,
    normalizeCollectorUrl,
    normalizeTelemetryEnvironment,
    resolveBrowserEnvironment,
    resolveBrowserFetch,
    resolveTracePropagationOrigins,
    shouldTraceBrowserRequest,
} from './utils.js'

const getBrowserAttributes = (userAgent: string): BrowserAttributes => {
    const browserMatch = userAgent.match(/(?:Edg|Chrome|Firefox|Version)\/([\d.]+)/u)
    const browserName = userAgent.includes('Edg/')
        ? 'Edge'
        : userAgent.includes('Chrome/')
          ? 'Chrome'
          : userAgent.includes('Firefox/')
            ? 'Firefox'
            : userAgent.includes('Safari/')
              ? 'Safari'
              : 'Other'
    const osName = userAgent.includes('Windows')
        ? 'Windows'
        : userAgent.includes('Android')
          ? 'Android'
          : userAgent.includes('iPhone') || userAgent.includes('iPad')
            ? 'iOS'
            : userAgent.includes('Mac OS')
              ? 'macOS'
              : userAgent.includes('Linux')
                ? 'Linux'
                : 'Other'

    return {
        browser_name: browserName,
        browser_version: browserMatch?.at(1) ?? '',
        os_name: osName,
        device_type: /Mobi|Android|iPhone|iPad/u.test(userAgent) ? 'mobile' : 'desktop',
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
    }
}

export class InkronikBrowserClient {
    private readonly publicKey: string
    private readonly collectorUrl: string
    private readonly telemetryEnvironment: string
    private readonly sampleRate: number
    private readonly defaultAttributes: BrowserAttributes
    private readonly maxBatchSize: number
    private readonly maxQueueSize: number
    private readonly maxRetries: number
    private readonly fetchImpl: BrowserFetch
    private readonly onError: (error: Error) => void
    private readonly getRoute: () => string
    private readonly sanitizeUrl: (url: URL) => string
    private readonly enableFetchTracing: boolean
    private readonly enableNavigationTracking: boolean
    private readonly tracePropagationOrigins: ReadonlySet<string>
    private readonly environment = resolveBrowserEnvironment()
    private readonly session = resolveBrowserSession({ storage: resolveBrowserStorage(this.environment?.window ?? null) })
    private readonly flushTimer: ReturnType<typeof setInterval> | null
    private readonly cleanupInstrumentation: () => void
    private readonly cleanupLifecycle: () => void
    private readonly sampled: boolean
    private queue: ReadonlyArray<BrowserQueueItem> = []
    private flushing: Promise<void> | null = null
    private viewContext: BrowserViewContext
    private userId = ''
    private userAttributes: BrowserAttributes = {}
    private closed = false

    constructor(options: CreateInkronikBrowserOptions) {
        this.publicKey = options.publicKey
        this.collectorUrl = normalizeCollectorUrl(options.collectorUrl)
        this.telemetryEnvironment = normalizeTelemetryEnvironment(options.environment)
        this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE
        this.defaultAttributes = {
            ...(this.environment === null ? {} : getBrowserAttributes(this.environment.navigator.userAgent)),
            ...options.defaultAttributes,
        }
        this.maxBatchSize = Math.max(1, options.maxBatchSize ?? DEFAULT_BATCH_SIZE)
        this.maxQueueSize = Math.max(1, options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE)
        this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES)
        this.fetchImpl = resolveBrowserFetch({ configuredFetch: options.fetchImpl, environment: this.environment })
        this.onError = options.onError ?? (() => undefined)
        this.getRoute = options.getRoute ?? (() => this.environment?.location.pathname ?? '')
        this.sanitizeUrl = createPrivacyPreservingUrlSanitizer(options.sanitizeUrl)
        this.enableFetchTracing = options.enableFetchTracing ?? true
        this.enableNavigationTracking = options.enableNavigationTracking ?? true
        this.tracePropagationOrigins = resolveTracePropagationOrigins({
            environment: this.environment,
            configuredOrigins: options.tracePropagationOrigins,
        })
        this.sampled = deterministicSample({ sampleRate: this.sampleRate, sessionId: this.session.currentId() })
        this.viewContext = { ...createRootBrowserTraceContext(), viewId: createUuid() }

        if (options.user !== undefined) {
            this.setUser(options.user)
        }

        this.flushTimer =
            this.environment === null ? null : setInterval(() => void this.flush(), options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS)
        this.cleanupInstrumentation = this.installInstrumentation()
        this.cleanupLifecycle = this.installLifecycle()

        this.startView({ eventType: 'page_view', name: 'page_view' })
    }

    capture(input: CaptureEventInput): void {
        this.enqueue({
            eventType: 'custom',
            name: input.name,
            level: input.level,
            message: input.message,
            attributes: input.attributes,
            measurements: input.measurements,
        })
    }

    captureError(error: unknown, options: CaptureErrorOptions): void {
        this.enqueue({
            eventType: 'custom',
            name: options.name,
            level: 'error',
            message: options.message,
            error: normalizeCapturedBrowserError(error),
            attributes: options.attributes,
            measurements: options.measurements,
        })
    }

    setUser(input: SetUserInput): void {
        const context = normalizeBrowserUserContext(input)

        this.userId = context.id
        this.userAttributes = context.attributes
    }

    clearUser(): void {
        this.userId = ''
        this.userAttributes = {}
    }

    captureNavigation(input: CaptureBrowserNavigationInput): void {
        this.startView({ eventType: 'navigation', name: input.navigationType, url: input.url })
    }

    flush(): Promise<void> {
        return this.flushBatch(false)
    }

    async shutdown(): Promise<void> {
        if (this.closed) {
            return
        }

        this.closed = true

        if (this.flushTimer !== null) {
            clearInterval(this.flushTimer)
        }

        this.cleanupInstrumentation()
        this.cleanupLifecycle()
        await this.flushBatch(true)
    }

    private beginView(name: string): void {
        this.startView({ eventType: 'navigation', name })
    }

    private startView(input: StartBrowserViewInput): void {
        this.viewContext = { ...createRootBrowserTraceContext(), viewId: createUuid() }

        if (this.environment === null) {
            return
        }

        const timestamp = new Date().toISOString()
        const sessionId = this.session.touch()
        const viewUrl = new URL(input.url ?? this.environment.location.href, this.environment.location.href)
        const pageUrl = this.sanitizeUrl(viewUrl)
        const route = sanitizeBrowserRoute(input.url === undefined ? this.getRoute() : viewUrl.pathname)
        const attributes = { ...this.defaultAttributes, ...this.userAttributes }

        this.enqueueSpan(
            buildBrowserSpan({
                context: this.viewContext,
                name: `${input.eventType} ${route}`,
                timestamp,
                endTime: timestamp,
                durationUs: 0,
                spanKind: 'internal',
                spanCategory: 'navigation',
                statusCode: 'ok',
                sessionId,
                viewId: this.viewContext.viewId,
                pageUrl,
                route,
                userId: this.userId,
                attributes,
            }),
        )
        this.enqueue({ eventType: input.eventType, name: input.name, context: { pageUrl, route } })
    }

    private enqueue(input: EnqueueBrowserEventInput): void {
        if (!this.sampled || this.closed || this.environment === null) {
            return
        }

        const sessionId = this.session.touch()
        const { context, ...eventInput } = input
        const pageUrl = context?.pageUrl ?? this.sanitizeUrl(new URL(this.environment.location.href))
        const event = buildBrowserEvent({
            ...eventInput,
            defaultAttributes: { ...this.defaultAttributes, ...this.userAttributes },
            pageUrl,
            route: context?.route ?? this.getRoute(),
            sessionId,
            userId: this.userId,
            viewId: this.viewContext.viewId,
            traceId: this.viewContext.traceId,
            spanId: this.viewContext.spanId,
        })
        this.enqueueItem({ itemType: 'event', event })
    }

    private enqueueSpan(span: BrowserSpan): void {
        this.enqueueItem({ itemType: 'span', span })
    }

    private enqueueItem(item: BrowserQueueItem): void {
        if (!this.sampled || this.closed || this.environment === null) {
            return
        }

        this.queue = [...this.queue.slice(-(this.maxQueueSize - 1)), item]

        if (this.queue.length >= this.maxBatchSize) {
            void this.flush()
        }
    }

    private flushBatch(useBeacon: boolean): Promise<void> {
        if (this.flushing !== null) {
            return this.flushing
        }

        const batch = this.queue.slice(0, this.maxBatchSize)

        if (batch.length === 0) {
            return Promise.resolve()
        }

        this.queue = this.queue.slice(batch.length)
        const transportBatch: BrowserTransportBatch = {
            events: batch.flatMap(item => (item.itemType === 'event' ? [item.event] : [])),
            spans: batch.flatMap(item => (item.itemType === 'span' ? [item.span] : [])),
        }
        const operation = sendBrowserBatch({
            collectorUrl: this.collectorUrl,
            publicKey: this.publicKey,
            environment: this.telemetryEnvironment,
            ...transportBatch,
            useBeacon,
            fetchImpl: this.fetchImpl,
            maxRetries: this.maxRetries,
            onError: this.onError,
        })
            .then(result => {
                if (!result.delivered) {
                    this.queue = [...batch, ...this.queue].slice(0, this.maxQueueSize)
                }
            })
            .finally(() => {
                this.flushing = null
            })

        this.flushing = operation

        return operation
    }

    private installInstrumentation(): () => void {
        if (this.environment === null) {
            return () => undefined
        }

        return installBrowserInstrumentation({
            environment: this.environment,
            capture: input => this.enqueue(input),
            beginView: name => this.beginView(name),
            traceFetch: this.traceFetch,
            enableFetchTracing: this.enableFetchTracing,
            enableNavigationTracking: this.enableNavigationTracking,
        })
    }

    private readonly traceFetch: BrowserFetch = async (input, init) => {
        if (this.environment === null || !this.sampled || this.closed) {
            return this.fetchImpl(input, init)
        }

        const request = new Request(input, init)
        const requestUrl = new URL(request.url, this.environment.location.href)

        if (
            !shouldTraceBrowserRequest({
                collectorUrl: this.collectorUrl,
                requestUrl,
                tracePropagationOrigins: this.tracePropagationOrigins,
            })
        ) {
            return this.fetchImpl(input, init)
        }

        const context = createRootBrowserTraceContext()
        const sessionId = this.session.touch()
        const headers = new Headers(request.headers)
        headers.set('traceparent', toBrowserTraceparent(context))
        const tracedRequest = new Request(request, { headers })
        const completionInput = {
            context,
            viewContext: this.viewContext,
            request: tracedRequest,
            startedAt: this.environment.performance.now(),
            timestamp: new Date().toISOString(),
            pageUrl: this.sanitizeUrl(new URL(this.environment.location.href)),
            route: this.getRoute(),
            userId: this.userId,
            sessionId,
            attributes: { ...this.defaultAttributes, ...this.userAttributes },
        }

        return this.fetchImpl(tracedRequest).then(
            response => {
                this.completeFetchSpan({ ...completionInput, response })

                return response
            },
            error => {
                this.completeFetchSpan({ ...completionInput, error })
                throw error
            },
        )
    }

    private completeFetchSpan(input: CompleteBrowserFetchSpanInput): void {
        const requestUrl = new URL(input.request.url)
        const statusCode = input.response?.status ?? 0
        const hasError = input.error !== undefined || statusCode >= 500

        this.enqueueSpan(
            buildBrowserSpan({
                context: input.context,
                name: `${input.request.method} ${requestUrl.pathname}`,
                timestamp: input.timestamp,
                endTime: new Date().toISOString(),
                durationUs: Math.max(0, (this.environment?.performance.now() ?? input.startedAt) - input.startedAt) * 1000,
                spanKind: 'client',
                spanCategory: 'http',
                statusCode: hasError ? 'error' : 'ok',
                statusMessage: input.error === undefined ? '' : 'FetchError',
                sessionId: input.sessionId,
                viewId: input.viewContext.viewId,
                pageUrl: input.pageUrl,
                route: input.route,
                userId: input.userId,
                httpMethod: input.request.method,
                httpUrl: requestUrl.toString(),
                httpStatusCode: statusCode,
                attributes: input.attributes,
            }),
        )
    }

    private installLifecycle(): () => void {
        if (this.environment === null) {
            return () => undefined
        }

        const flushOnHide = () => void this.flushBatch(true)
        const onVisibilityChange = () => {
            if (this.environment?.document.visibilityState === 'hidden') {
                flushOnHide()
            }
        }

        this.environment.window.addEventListener('pagehide', flushOnHide)
        this.environment.document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            this.environment?.window.removeEventListener('pagehide', flushOnHide)
            this.environment?.document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }
}
