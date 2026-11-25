export const createSyntheticJwt = (paddingLength: number): string =>
    [
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
        JSON.stringify({ sub: 'JWT_PRIVACY_CANARY', padding: 'x'.repeat(paddingLength) }),
        'FAKE_SIGNATURE',
    ]
        .map(value => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''))
        .join('.')

// Construct each encoding depth directly from the original synthetic token, without re-escaping an escaped value.
export const encodeSyntheticToken = (token: string, depth: number): string =>
    Array.from(token, character => `%${'25'.repeat(depth - 1)}${character.charCodeAt(0).toString(16)}`).join('')
