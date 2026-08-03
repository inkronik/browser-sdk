export type BrowserEventType = 'page_view' | 'navigation' | 'web_vital' | 'javascript_error' | 'unhandled_rejection' | 'custom'
export type EventLevel = 'info' | 'warning' | 'error'
export type BrowserAttributeValue = string | number | boolean

export interface BrowserEvent {
    readonly event_id: string
    readonly event_type: BrowserEventType
    readonly name: string
    readonly level: EventLevel
    readonly message: string
    readonly timestamp: string
    readonly session_id: string
    readonly view_id: string
    readonly page_url: string
    readonly route: string
    readonly user_id: string
    readonly trace_id: string
    readonly span_id: string
    readonly error_type: string
    readonly error_message: string
    readonly error_stack: string
    readonly error_code: string
    readonly error_handled: boolean
    readonly attributes: Readonly<Record<string, BrowserAttributeValue>>
    readonly measurements: Readonly<Record<string, number>>
}

export interface BrowserSpan {
    readonly trace_id: string
    readonly span_id: string
    readonly parent_span_id: string
    readonly name: string
    readonly timestamp: string
    readonly end_time: string
    readonly duration_us: number
    readonly span_kind: 'internal' | 'client'
    readonly span_category: 'navigation' | 'http'
    readonly status_code: 'ok' | 'error'
    readonly status_message: string
    readonly session_id: string
    readonly view_id: string
    readonly page_url: string
    readonly route: string
    readonly user_id: string
    readonly http_method: string
    readonly http_url: string
    readonly http_status_code: number
    readonly attributes: Readonly<Record<string, BrowserAttributeValue>>
}

export interface BrowserIngestRequest {
    readonly public_key: string
    readonly events: ReadonlyArray<BrowserEvent>
    readonly spans: ReadonlyArray<BrowserSpan>
}
