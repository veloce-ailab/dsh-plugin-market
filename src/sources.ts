import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parsePluginManifest, parsePluginSource, readPluginManifest, type PluginManifest, type PluginSource } from './manifest.js'

const SOURCES_FILE = join(homedir(), '.dsh', 'plugin-sources.json')

/** Read the globally configured plugin sources. Missing files mean no custom sources. */
export async function readPluginSources(): Promise<readonly PluginSource[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(SOURCES_FILE, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('global plugin source file must contain an array')
    return parsed.map(parsePluginSource)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** Atomically persist globally configured plugin sources. */
export async function writePluginSources(sources: readonly PluginSource[]): Promise<void> {
  await mkdir(dirname(SOURCES_FILE), { recursive: true })
  const temporary = `${SOURCES_FILE}.tmp`
  await writeFile(temporary, `${JSON.stringify(sources, null, 2)}\n`, 'utf8')
  await rename(temporary, SOURCES_FILE)
}

/** Validate a source by fetching its manifest before it is saved. */
export async function validatePluginSource(source: PluginSource): Promise<PluginManifest> {
  return parsePluginManifest(await readPluginManifest(source.url))
}

/** Fetch manifests from all enabled global sources and preserve source metadata. */
export async function readGlobalPluginCatalog(): Promise<readonly (PluginManifest & { readonly sourceId: string; readonly sourceUrl: string })[]> {
  const sources = await readPluginSources()
  const results = []
  for (const source of sources) {
    if (!source.enabled) continue
    const manifest = await validatePluginSource(source)
    results.push({ ...manifest, sourceId: source.id, sourceUrl: source.url })
  }
  return results
}
