/* eslint-disable functional/immutable-data, functional/functional-parameters, @typescript-eslint/unbound-method -- XHR instrumentation patches host methods and keeps per-request lifecycle state. */
import type { BrowserInstrumentationInput, BrowserRequestTraceInput, BrowserXhrState, ResolveBrowserXhrRequestInput } from './types.js'

const originalXhrSend = Symbol.for('inkronik.browser.originalXhrSend')

const resolveRequest = ({ args, input }: ResolveBrowserXhrRequestInput): BrowserRequestTraceInput | undefined => {
    const [method, url] = args
    if (typeof method !== 'string' || (typeof url !== 'string' && !(url instanceof URL))) return undefined
    try {
        const base = input.environment.document.baseURI
        return {
            transport: 'xhr',
            method: method.toUpperCase(),
            url: new URL(url, typeof base === 'string' && base.length > 0 ? base : input.environment.location.href),
        }
    } catch {
        return undefined
    }
}

// Instrumentation failures must not change an application's network behavior.
const safely = (operation: () => void): void => {
    try {
        operation()
    } catch {
        // The request still belongs to the host network API.
    }
}

export const installBrowserXhrInstrumentation = (input: BrowserInstrumentationInput): (() => void) => {
    const constructor = Reflect.get(input.environment.window, 'XMLHttpRequest') as typeof XMLHttpRequest | undefined
    if (!input.enableXhrTracing || typeof constructor !== 'function') return () => undefined
    const prototype = constructor.prototype
    const open = prototype.open
    const send = prototype.send
    const setRequestHeader = prototype.setRequestHeader
    if (Reflect.get(send, originalXhrSend) !== undefined) return () => undefined
    const states = new WeakMap<XMLHttpRequest, BrowserXhrState>()
    const active = new Set<() => void>()
    const instrumentedOpen = function (this: XMLHttpRequest, ...args: ReadonlyArray<unknown>): unknown {
        const previous = states.get(this)
        const result = Reflect.apply(open, this, args)
        previous?.cancel?.()
        const request = resolveRequest({ args, input })
        states.delete(this)
        if (request !== undefined) states.set(this, { request, hasTraceparent: false })
        return result
    }
    const instrumentedSetRequestHeader = function (this: XMLHttpRequest, ...args: ReadonlyArray<unknown>): unknown {
        const result = Reflect.apply(setRequestHeader, this, args)
        const state = states.get(this)
        if (state !== undefined && typeof args[0] === 'string' && args[0].toLowerCase() === 'traceparent') {
            states.set(this, { ...state, hasTraceparent: true })
        }
        return result
    }
    const instrumentedSend = function (this: XMLHttpRequest, ...args: ReadonlyArray<unknown>): unknown {
        const state = states.get(this)
        // fetch polyfills and other tracers may already own this request. Do not append a
        // second traceparent or emit another span for the same transport operation.
        if (state === undefined || state.hasTraceparent || state.cleanup !== undefined) return Reflect.apply(send, this, args)
        const trace = (() => {
            try {
                return input.startXhrTrace(state.request)
            } catch {
                return undefined
            }
        })()
        if (trace === undefined) return Reflect.apply(send, this, args)
        const cleanup = (): void => {
            this.removeEventListener('readystatechange', onReadyStateChange)
            this.removeEventListener('loadend', finish)
            active.delete(cleanup)
            states.set(this, { ...state, hasTraceparent: true })
        }
        const finish = (): void => {
            if (!active.has(cleanup)) return
            cleanup()
            safely(() => trace.complete({ status: this.status, ...(this.status === 0 ? { error: new Error('XHR failed or was cancelled') } : {}) }))
        }
        const onReadyStateChange = (): void => {
            if (this.readyState === 4) finish()
        }
        setRequestHeader.call(this, 'traceparent', trace.traceparent)
        states.set(this, {
            ...state,
            hasTraceparent: true,
            cleanup,
            cancel: () => {
                if (!active.has(cleanup)) return
                cleanup()
                safely(() => trace.complete({ status: 0, error: new Error('XHR was reopened') }))
            },
        })
        active.add(cleanup)
        this.addEventListener('readystatechange', onReadyStateChange)
        this.addEventListener('loadend', finish)
        try {
            return Reflect.apply(send, this, args)
        } catch (error) {
            cleanup()
            safely(() => trace.complete({ status: 0, error }))
            throw error
        }
    }
    Reflect.defineProperty(instrumentedSend, originalXhrSend, { value: send })
    prototype.open = instrumentedOpen as typeof open
    prototype.send = instrumentedSend as typeof send
    prototype.setRequestHeader = instrumentedSetRequestHeader as typeof setRequestHeader
    return () => {
        active.forEach(cleanup => cleanup())
        if (prototype.open === instrumentedOpen) prototype.open = open
        if (prototype.send === instrumentedSend) prototype.send = send
        if (prototype.setRequestHeader === instrumentedSetRequestHeader) prototype.setRequestHeader = setRequestHeader
    }
}
