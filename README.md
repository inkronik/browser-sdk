# `@inkronik/browser`

Privacy-first browser RUM, distributed tracing, and product-event collection for Inkronik.

## Installation

```bash
bun add @inkronik/browser
```

The package ships compiled, tree-shakeable ESM and TypeScript declarations. It has no runtime dependencies and is safe to import during server-side
rendering; browser instrumentation starts only when a client is constructed in a browser environment.

## Usage

Create the client only after your application's consent policy permits telemetry:

```ts
import { createInkronikBrowser } from '@inkronik/browser'

const inkronik = createInkronikBrowser({
    publicKey: 'ik_pub_...',
    collectorUrl: 'https://collector.inkronik.codemask.dev',
    tracePropagationOrigins: ['https://api.example.com'],
    user: {
        id: currentUser.uuid,
        attributes: { role: currentUser.role, tenant_id: currentUser.tenantId },
    },
})

inkronik.capture({ name: 'checkout_started', attributes: { plan: 'pro' } })

// Authentication state can change after initialization.
inkronik.setUser({ id: currentUser.uuid, attributes: { role: currentUser.role } })
inkronik.clearUser()

// Flush queued telemetry and remove instrumentation during application teardown.
await inkronik.shutdown()
```

The public key is a revocable source identifier, not a secret. It can send only browser RUM, constrained browser spans, and custom events.

## Identity and privacy

Use one stable, opaque user ID across the browser and backend, ideally the authentication `sub` or UUID. Matching identifiers let RUM, product
events, request captures, logs, and traces be queried for the same user. Do not use an email address, name, phone number, or raw token as the ID.
User attributes are stored as `user.*`; sensitive keys and values are redacted in both the SDK and Collector.

The SDK:

- never reads form values, DOM text, request bodies, cookies, clipboard data, or arbitrary storage contents;
- strips URL credentials, query strings, fragments, and identifier-like route segments before transport;
- keeps its bounded telemetry queue in memory;
- persists only an anonymous session UUID and activity timestamps in `localStorage`, and falls back to an in-memory session when storage is
  unavailable;
- accepts only primitive custom attribute values and sanitizes them before transport.

## Distributed tracing

The SDK creates one trace per browser view and instruments `fetch`. Same-origin requests are traced by default. Cross-origin propagation happens
only for exact origins listed in `tracePropagationOrigins`:

```ts
const inkronik = createInkronikBrowser({
    publicKey: 'ik_pub_...',
    collectorUrl: 'https://collector.inkronik.codemask.dev',
    tracePropagationOrigins: ['https://api.example.com'],
})
```

The injected W3C `traceparent` lets an instrumented backend continue the browser trace through server, database, messaging, and external-service
spans. Collector requests are always excluded from fetch instrumentation.

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
