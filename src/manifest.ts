/** Versioned manifest and source validation for user-provided plugin catalogs. */
export const PLUGIN_MANIFEST_VERSION = 1 as const

export type PluginSourceKind = 'npm' | 'github'

export interface PluginManifestEntry {
  readonly name: string
  readonly author: string
  readonly source: PluginSourceKind
  readonly star?: number
  readonly package?: string
  readonly repository?: string
  readonly version?: string
  readonly displayName?: string
  readonly description?: string
  readonly homepage?: string
}

export interface PluginManifest {
  readonly manifestVersion: typeof PLUGIN_MANIFEST_VERSION
  readonly name: string
  readonly author: string
  readonly plugins: readonly PluginManifestEntry[]
}

export interface PluginSource {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly enabled: boolean
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string`)
  return value.trim()
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, field)
}

function httpsUrl(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field)
  if (text === undefined) return undefined
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error(`${field} must be a valid URL`) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error(`${field} must be an HTTPS URL without credentials or fragments`)
  return parsed.toString()
}

const packageName = /^(?:[a-z0-9][a-z0-9._-]*|@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)$/

/** Validate one manifest plugin entry from untrusted JSON. */
export function parsePluginManifestEntry(value: unknown): PluginManifestEntry {
  const source = record(value)
  if (source === undefined) throw new Error('manifest plugin entry must be an object')
  const name = requiredText(source.name, 'plugin name')
  const author = requiredText(source.author, 'plugin author')
  const kind = source.source
  if (kind !== 'npm' && kind !== 'github') throw new Error(`plugin ${name} source must be npm or github`)
  const packageValue = optionalText(source.package, 'plugin package')
  const repository = httpsUrl(source.repository, 'plugin repository')
  if (kind === 'npm' && !packageName.test(packageValue ?? name)) throw new Error(`plugin ${name} has an invalid npm package`)
  if (kind === 'github' && (repository === undefined || new URL(repository).hostname !== 'github.com' || new URL(repository).pathname.split('/').filter(Boolean).length !== 2)) throw new Error('GitHub plugins require an HTTPS github.com owner/repository URL')
  if (source.star !== undefined && (typeof source.star !== 'number' || !Number.isFinite(source.star) || source.star < 0)) throw new Error(`plugin ${name} star must be a non-negative number`)
  return {
    name,
    author,
    source: kind,
    ...(source.star === undefined ? {} : { star: source.star as number }),
    ...(packageValue === undefined ? {} : { package: packageValue }),
    ...(repository === undefined ? {} : { repository }),
    ...(source.version === undefined ? {} : { version: requiredText(source.version, 'plugin version') }),
    ...(source.displayName === undefined ? {} : { displayName: requiredText(source.displayName, 'plugin displayName') }),
    ...(source.description === undefined ? {} : { description: requiredText(source.description, 'plugin description') }),
    ...(source.homepage === undefined ? {} : { homepage: httpsUrl(source.homepage, 'plugin homepage')! }),
  }
}

/** Validate a complete version-one plugin manifest. */
export function parsePluginManifest(value: unknown): PluginManifest {
  const source = record(value)
  if (source === undefined || source.manifestVersion !== PLUGIN_MANIFEST_VERSION) throw new Error(`manifestVersion must be ${PLUGIN_MANIFEST_VERSION}`)
  if (!Array.isArray(source.plugins)) throw new Error('manifest plugins must be an array')
  const plugins = source.plugins.map(parsePluginManifestEntry)
  const names = new Set<string>()
  for (const plugin of plugins) {
    if (names.has(plugin.name)) throw new Error(`manifest contains duplicate plugin: ${plugin.name}`)
    names.add(plugin.name)
  }
  return { manifestVersion: PLUGIN_MANIFEST_VERSION, name: requiredText(source.name, 'manifest name'), author: requiredText(source.author, 'manifest author'), plugins }
}

/** Validate a persisted global plugin source definition. */
export function parsePluginSource(value: unknown): PluginSource {
  const source = record(value)
  if (source === undefined) throw new Error('plugin source must be an object')
  const id = requiredText(source.id, 'source id')
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new Error(`invalid source id: ${id}`)
  return { id, name: requiredText(source.name, 'source name'), url: httpsUrl(source.url, 'source url')!, enabled: source.enabled !== false }
}

/** Fetch and validate a remote plugin manifest. */
export async function readPluginManifest(url: string): Promise<PluginManifest> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`plugin source request failed (${response.status})`)
  return parsePluginManifest(await response.json())
}
