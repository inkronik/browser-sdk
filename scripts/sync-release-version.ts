export {}

const version = Bun.argv.at(2)

if (!version) {
    throw new Error('Release version is required.')
}

const constantsUrl = new URL('../src/constants.ts', import.meta.url)
const constants = await Bun.file(constantsUrl).text()
const nextConstants = constants.replace(/export const SDK_VERSION = '[^']+'/u, `export const SDK_VERSION = '${version}'`)

if (nextConstants === constants && !constants.includes(`export const SDK_VERSION = '${version}'`)) {
    throw new Error('SDK_VERSION declaration was not found.')
}

await Bun.write(constantsUrl, nextConstants)
