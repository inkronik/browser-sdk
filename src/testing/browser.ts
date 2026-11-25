/* eslint-disable functional/immutable-data -- Controlled browser host APIs are installed and restored by test fixtures. */
import type { BrowserFetch } from '../types.js'

export class FakeXhr extends EventTarget {
    public readonly headers = new Map<string, string>()
    public status = 200
    public readyState = 0
    public body: unknown
    public isFailing = false
    public method = ''
    public url = ''
    public open(method: string, url: string): void {
        this.method = method
        this.url = url
        this.headers.clear()
    }
    public setRequestHeader(name: string, value: string): void {
        const previous = this.headers.get(name.toLowerCase())
        this.headers.set(name.toLowerCase(), previous === undefined ? value : `${previous}, ${value}`)
    }
    public send(body: unknown): void {
        if (this.isFailing) throw new Error('network failure')
        this.body = body
    }
    public finish(status: number): void {
        this.status = status
        this.dispatchEvent(new Event('loadend'))
    }
}

export const installBrowserGlobals = (fetchImpl: BrowserFetch, performanceNow: () => number) => {
    const originalDescriptors = new Map(
        ['window', 'document', 'navigator', 'fetch', 'PerformanceObserver'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    )
    const history = { pushState: () => undefined, replaceState: () => undefined }
    const location = {
        href: 'https://app.example.com/recordings?input=PAGE_SECRET#fragment',
        origin: 'https://app.example.com',
        pathname: '/recordings',
    }
    const navigatorValue = { userAgent: 'TestBrowser/1.0' }
    const documentValue = { visibilityState: 'visible', addEventListener: () => undefined, removeEventListener: () => undefined }
    const windowValue = {
        XMLHttpRequest: FakeXhr,
        fetch: fetchImpl,
        history,
        location,
        navigator: navigatorValue,
        performance: { now: performanceNow, getEntriesByType: () => [] },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }
    Object.defineProperties(globalThis, {
        window: { configurable: true, value: windowValue },
        document: { configurable: true, value: documentValue },
        navigator: { configurable: true, value: navigatorValue },
        fetch: { configurable: true, value: fetchImpl },
        PerformanceObserver: { configurable: true, value: undefined },
    })
    return {
        windowValue,
        restore: () => {
            originalDescriptors.forEach((descriptor, name) => {
                if (descriptor === undefined) Reflect.deleteProperty(globalThis, name)
                else Object.defineProperty(globalThis, name, descriptor)
            })
        },
    }
}
