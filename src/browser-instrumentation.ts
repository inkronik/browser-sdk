/* eslint-disable functional/immutable-data -- Browser instrumentation must patch and restore external browser APIs. */
/* eslint-disable functional/functional-parameters -- History methods require their native variadic signatures. */
/* eslint-disable functional/prefer-tacit -- The wrapper preserves navigation instrumentation semantics. */
/* eslint-disable @typescript-eslint/unbound-method -- The original History methods are always invoked with History via apply. */
import { sanitizeBrowserUrl } from './sanitizer.js'
import { INKRONIK_ORIGINAL_BROWSER_FETCH } from './constants.js'
import type { BrowserInstrumentationInput, InteractionPerformanceEntry, LayoutShiftPerformanceEntry } from './types.js'

const safeUrl = (value: string): string => {
    try {
        return sanitizeBrowserUrl(value)
    } catch {
        return ''
    }
}

const installNavigationInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    if (!input.enableNavigationTracking) {
        return () => undefined
    }

    const originalPushState = input.environment.history.pushState
    const originalReplaceState = input.environment.history.replaceState
    const captureNavigation = () => input.beginView('navigation')
    const onPopState = () => captureNavigation()

    input.environment.history.pushState = (...arguments_: Parameters<History['pushState']>) => {
        const previousUrl = input.environment.location.href
        originalPushState.apply(input.environment.history, arguments_)

        if (input.environment.location.href !== previousUrl) {
            captureNavigation()
        }
    }
    input.environment.history.replaceState = (...arguments_: Parameters<History['replaceState']>) => {
        const previousUrl = input.environment.location.href
        originalReplaceState.apply(input.environment.history, arguments_)

        if (input.environment.location.href !== previousUrl) {
            captureNavigation()
        }
    }
    input.environment.window.addEventListener('popstate', onPopState)

    return () => {
        input.environment.history.pushState = originalPushState
        input.environment.history.replaceState = originalReplaceState
        input.environment.window.removeEventListener('popstate', onPopState)
    }
}

const installFetchInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    if (!input.enableFetchTracing) {
        return () => undefined
    }

    const currentFetch = input.environment.window.fetch

    if (Reflect.get(currentFetch, INKRONIK_ORIGINAL_BROWSER_FETCH) !== undefined) {
        return () => undefined
    }

    Reflect.defineProperty(input.traceFetch, INKRONIK_ORIGINAL_BROWSER_FETCH, { value: currentFetch })
    input.environment.window.fetch = input.traceFetch

    return () => {
        if (input.environment.window.fetch === input.traceFetch) {
            input.environment.window.fetch = currentFetch
        }
    }
}

const installErrorInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    const onError = (event: ErrorEvent) => {
        input.capture({
            eventType: 'javascript_error',
            name: event.error instanceof Error ? event.error.name : 'Error',
            attributes: {
                message: event.message,
                stack: event.error instanceof Error ? (event.error.stack ?? '') : '',
                file: safeUrl(event.filename),
                line: event.lineno,
                column: event.colno,
            },
        })
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason
        const isError = reason instanceof Error

        input.capture({
            eventType: 'unhandled_rejection',
            name: isError ? reason.name : 'UnhandledRejection',
            attributes: {
                reason: isError ? reason.message : typeof reason === 'string' ? reason : '[non-error rejection]',
                stack: isError ? (reason.stack ?? '') : '',
            },
        })
    }

    input.environment.window.addEventListener('error', onError)
    input.environment.window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
        input.environment.window.removeEventListener('error', onError)
        input.environment.window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
}

const observe = ({
    capture,
    entryTypes,
}: {
    readonly capture: (entry: PerformanceEntry) => void
    readonly entryTypes: ReadonlyArray<string>
}): (() => void) => {
    if (typeof PerformanceObserver === 'undefined') {
        return () => undefined
    }

    const observer = new PerformanceObserver(list => list.getEntries().forEach(capture))

    entryTypes.forEach(type => {
        try {
            observer.observe({ type, buffered: true })
        } catch {
            // Unsupported browser entry types remain absent rather than being fabricated.
        }
    })

    return () => observer.disconnect()
}

const installWebVitalsInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    const cleanupObservers = [
        observe({
            entryTypes: ['largest-contentful-paint'],
            capture: entry =>
                input.capture({ eventType: 'web_vital', name: 'LCP', measurements: { value: entry.startTime }, attributes: { unit: 'ms' } }),
        }),
        observe({
            entryTypes: ['layout-shift'],
            capture: entry => {
                const layoutShift = entry as LayoutShiftPerformanceEntry

                if (!layoutShift.hadRecentInput) {
                    input.capture({ eventType: 'web_vital', name: 'CLS', measurements: { value: layoutShift.value }, attributes: { unit: 'score' } })
                }
            },
        }),
        observe({
            entryTypes: ['event'],
            capture: entry => {
                const interaction = entry as InteractionPerformanceEntry

                if (interaction.interactionId > 0) {
                    input.capture({ eventType: 'web_vital', name: 'INP', measurements: { value: interaction.duration }, attributes: { unit: 'ms' } })
                }
            },
        }),
        observe({
            entryTypes: ['paint'],
            capture: entry => {
                if (entry.name === 'first-contentful-paint') {
                    input.capture({ eventType: 'web_vital', name: 'FCP', measurements: { value: entry.startTime }, attributes: { unit: 'ms' } })
                }
            },
        }),
    ]
    const navigation = input.environment.performance.getEntriesByType('navigation').at(0) as PerformanceNavigationTiming | undefined

    if (navigation !== undefined) {
        input.capture({
            eventType: 'web_vital',
            name: 'TTFB',
            measurements: { value: Math.max(0, navigation.responseStart - navigation.requestStart) },
            attributes: { unit: 'ms' },
        })
    }

    return () => cleanupObservers.forEach(cleanup => cleanup())
}

export const installBrowserInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    const cleanups = [
        installNavigationInstrumentation(input),
        installFetchInstrumentation(input),
        installErrorInstrumentation(input),
        installWebVitalsInstrumentation(input),
    ]

    return () => cleanups.forEach(cleanup => cleanup())
}
