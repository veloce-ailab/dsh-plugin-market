import { mkdir, readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
await mkdir(new URL('../lib/', import.meta.url), { recursive: true })
await writeFile(new URL('../lib/client.js', import.meta.url), source)
