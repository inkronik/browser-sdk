import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const packageLink = fileURLToPath(new URL('./fixtures/next-app/node_modules/@inkronik/browser-sdk', import.meta.url))
const nextBuildDirectory = fileURLToPath(new URL('./fixtures/next-app/.next', import.meta.url))

await rm(nextBuildDirectory, { force: true, recursive: true })
await mkdir(dirname(packageLink), { recursive: true })
await rm(packageLink, { force: true, recursive: true })
await mkdir(packageLink, { recursive: true })
await Promise.all([
    copyFile(join(projectDirectory, 'package.json'), join(packageLink, 'package.json')),
    cp(join(projectDirectory, 'dist'), join(packageLink, 'dist'), { recursive: true }),
])
