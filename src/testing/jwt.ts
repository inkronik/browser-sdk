export const createSyntheticJwt = (paddingLength: number): string =>
    [
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
        JSON.stringify({ sub: 'JWT_PRIVACY_CANARY', padding: 'x'.repeat(paddingLength) }),
        'FAKE_SIGNATURE',
    ]
        .map(value => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''))
        .join('.')
