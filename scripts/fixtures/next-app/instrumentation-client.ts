import { createInkronikNext } from '@inkronik/browser-sdk/next'

export const { client: inkronik, onRouterTransitionStart } = createInkronikNext({
    collectorUrl: 'https://collector.example.com',
    environment: 'test',
    publicKey: `ik_pub_${'a'.repeat(43)}`,
})
