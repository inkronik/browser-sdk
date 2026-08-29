# `@inkronik/browser-sdk`

Privacy-first browser RUM, distributed tracing, and product-event collection for Inkronik.

## Installation

```bash
bun add @inkronik/browser-sdk
```

The package ships compiled, tree-shakeable ESM and TypeScript declarations. It has no runtime dependencies and is safe to import during server-side
rendering; browser instrumentation starts only when a client is constructed in a browser environment.

## Usage

Create the client only after your application's consent policy permits telemetry:

```ts
import { createInkronikBrowser } from '@inkronik/browser-sdk'

const inkronik = createInkronikBrowser({
    publicKey: 'ik_pub_...',
    collectorUrl: 'https://collector.inkronik.codemask.dev',
    environment: 'production',
    tracePropagationOrigins: ['https://api.example.com'],
    user: {
        id: currentUser.uuid,
        attributes: { role: currentUser.role, tenant_id: currentUser.tenantId },
    },
})

inkronik.capture({
    name: 'checkout_started',
    level: 'info',
    message: 'Customer entered checkout',
    attributes: { plan: 'pro' },
})

try {
    await submitCheckout()
} catch (error) {
    inkronik.captureError(error, {
        name: 'checkout_submit_failed',
        message: 'Checkout stayed open so the customer can retry',
        attributes: { plan: 'pro' },
    })
}

// Authentication state can change after initialization.
inkronik.setUser({ id: currentUser.uuid, attributes: { role: currentUser.role } })
inkronik.clearUser()

// Flush queued telemetry and remove instrumentation during application teardown.
await inkronik.shutdown()
```

The public key is a revocable source identifier, not a secret. It can send only browser RUM, constrained browser spans, and custom events.
The required `environment` option identifies the deployment sending each batch. The same application-scoped public key may therefore be used by
multiple exact origins while development, staging, and production telemetry remain separate.

## Next.js

Next.js 15.3 and newer can initialize browser telemetry before hydration through `instrumentation-client.ts`. The dedicated entrypoint also uses
Next.js' router transition hook instead of patching History, so each client-side route change creates one navigation view:

```ts
// instrumentation-client.ts
import { createInkronikNext } from '@inkronik/browser-sdk/next'

export const { client: inkronik, onRouterTransitionStart } = createInkronikNext({
    publicKey: process.env.NEXT_PUBLIC_INKRONIK_PUBLIC_KEY!,
    collectorUrl: process.env.NEXT_PUBLIC_INKRONIK_COLLECTOR_URL!,
    environment: process.env.NEXT_PUBLIC_INKRONIK_ENVIRONMENT ?? 'development',
    tracePropagationOrigins: ['https://api.example.com'],
})
```

Create the integration only after the application's consent policy permits telemetry. Values prefixed with `NEXT_PUBLIC_` are bundled for the
browser: use only the Browser Source public key here, never the server ingest API key. The root package remains appropriate for older Next.js
versions and other SPA routers; its History integration ignores `pushState` and `replaceState` calls that do not change the URL.

## Identity and privacy

Use one stable, opaque user ID across the browser and backend, ideally the authentication `sub` or UUID. Matching identifiers let RUM, product
events, request captures, logs, and traces be queried for the same user. Do not use an email address, name, phone number, or raw token as the ID.
User attributes are stored as `user.*`; sensitive keys and values are redacted in both the SDK and Collector.

Custom events support `info`, `warning`, and `error` levels and default to `info`. `captureError` records a handled error with its bounded type,
message, stack, and string code when available. Error text and stacks pass through browser redaction; production stacks remain minified unless the
deployment has a separate source-map symbolication pipeline.

The SDK:

- never reads form values, DOM text, request bodies, cookies, clipboard data, or arbitrary storage contents;
- strips URL credentials, query strings, fragments, and identifier-like route segments before transport;
- keeps its bounded telemetry queue in memory;
- persists only an anonymous session UUID and activity timestamps in `localStorage`, and falls back to an in-memory session when storage is
  unavailable;
- accepts only primitive custom attribute values and sanitizes them before transport.

The SDK always applies its baseline URL privacy sanitization before and after the optional `sanitizeUrl` callback. The callback receives an HTTP(S)
URL with credentials, query strings, fragments, and identifier-like path segments already removed, and can apply additional path redaction. If the
callback throws or returns an empty, invalid, or non-HTTP(S) URL, the SDK omits the page URL rather than falling back to the original value. This is
structural data minimization, not general secret detection: applications should still avoid putting sensitive data in URL paths.

## Distributed tracing

The SDK creates a separate trace for every instrumented `fetch`. Browser view events retain their own view trace, while `view_id` and `session_id`
correlate each request trace back to the view and session that initiated it. Same-origin requests are traced by default. Cross-origin propagation
happens only for exact origins listed in `tracePropagationOrigins`:

```ts
const inkronik = createInkronikBrowser({
    publicKey: 'ik_pub_...',
    collectorUrl: 'https://collector.inkronik.codemask.dev',
    environment: 'production',
    tracePropagationOrigins: ['https://api.example.com'],
})
```

The injected W3C `traceparent` lets an instrumented backend continue that request's trace through server, database, messaging, and external-service
spans. Separate requests never share a trace solely because they occurred in the same long-lived SPA view. Collector requests are always excluded
from fetch instrumentation.

Adding `traceparent` to a cross-origin request requires the target API's CORS policy to allow that request header. Send trace context only to
services you trust; configured targets are normalized to exact origins.

Set `enableFetchTracing: false` if another library must exclusively own global fetch instrumentation.

## Manual flushing

The SDK flushes automatically by interval and batch size. You can also request delivery explicitly:

```ts
await inkronik.flush()
```

`shutdown()` removes installed browser hooks, stops the timer, and attempts a final delivery using `sendBeacon` when available.

## Development

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run check:lint
bun run check:format
bun run build
npm pack --dry-run
```

See [RELEASING.md](./RELEASING.md) for the release process and [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## License

MIT License. See [LICENSE](./LICENSE).
