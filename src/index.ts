/**
 * Settings-native npm plugin market and configuration editor for DSH.
 *
 * The browser panel reads live Loader entries, installs selected npm plugins
 * into the shared profile module directory, and appends only explicit user
 * overrides or new Loader rows to the profile patch.
 */

import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

const API_PATH = '/plugin-market/config'
const PACKAGE_API_PATH = '/plugin-market/packages'
const CURATED_API_PATH = '/plugin-market/curated'
const CLIENT_PATH = '/plugin-market/client.js'
const MAX_REQUEST_BYTES = 1024 * 1024
const NPM_REPLICATION_URL = 'https://replicate.npmjs.com'
const NPM_REGISTRY_URL = 'https://registry.npmjs.org'
const AWESOME_DSH_RAW_URL = 'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data'
const PACKAGE_PAGE_SIZE = 200
const PACKAGE_CACHE_MS = 5 * 60 * 1000

interface LoaderEntry {
  readonly id: string
  readonly options: {
    readonly name: string
    readonly group?: boolean | null
    readonly config?: unknown
  }
  readonly fiber?: {
    readonly runtime?: { readonly Config?: unknown } | null
  }
}

interface MarketContext extends Context {
  readonly loader: { entries(): Iterable<LoaderEntry> }
  readonly webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
    }): () => void
    tapIndex(transform: (html: string) => string): () => void
  }
}

interface SaveRequest {
  id: string
  config: unknown
}

interface AddPluginRequest {
  name: string
}

interface InstallRequest {
  name: string
  version: string
}

interface GitHubInstallRequest {
  owner: string
  repo: string
}

interface MarketPackage {
  name: string
  description?: string
  latest?: string
  installedVersion?: string
}

interface PackageMetadata {
  versions: readonly string[]
  latest?: string
}

interface CuratedPlugin {
  owner: string
  repo: string
  npm?: string
  stars?: number
  addedAt?: string
  installedName?: string
}

let packageCache: { expiresAt: number, packages: readonly MarketPackage[] } | undefined
let curatedCache: { expiresAt: number, plugins: readonly CuratedPlugin[] } | undefined

/** One schema-derived top-level field understood by the browser form. */
interface FormField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'json'
  required: boolean
  description?: string
  default?: unknown
  choices?: readonly unknown[]
}

/** Browser-safe object-config schema. */
interface FormSchema {
  fields: readonly FormField[]
}

/** Narrow an opaque schema implementation to its enumerable metadata. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    ? value as Record<string, unknown>
    : undefined
}

/** Prefer Chinese schema copy, then English, then the first available text. */
function description(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const localized = record(value)
  if (localized === undefined) return undefined
  for (const key of ['zh', 'zh-CN', 'en', '']) {
    if (typeof localized[key] === 'string') return localized[key] as string
  }
  return Object.values(localized).find((item): item is string => typeof item === 'string')
}

/** Convert one Schemastery/Zod leaf into a generic browser field. */
function formField(key: string, source: unknown): FormField | undefined {
  const schema = record(source)
  if (schema === undefined) return undefined
  const meta = record(schema.meta)
  const zod = record(record(schema._zod)?.def) ?? record(schema._def)
  const rawType = typeof schema.type === 'string' ? schema.type : zod?.type
  const inner = schema.inner ?? zod?.innerType
  if (rawType === 'optional' || rawType === 'nullable' || rawType === 'default') {
    const child = formField(key, inner)
    if (child === undefined) return undefined
    return {
      ...child,
      required: rawType === 'optional' || rawType === 'nullable' ? false : child.required,
      ...rawType === 'default' && zod?.defaultValue !== undefined ? { default: zod.defaultValue } : {},
    }
  }
  const required = meta?.required === true
  const fieldDescription = description(meta?.description ?? schema.description)
  const fieldDefault = meta?.default
  const extra = {
    required,
    ...(fieldDescription === undefined ? {} : { description: fieldDescription }),
    ...(fieldDefault === undefined ? {} : { default: fieldDefault }),
  }
  if (rawType === 'string' || rawType === 'number' || rawType === 'boolean') return { key, type: rawType, ...extra }
  const constants = rawType === 'union' && Array.isArray(schema.list)
    ? schema.list.map(item => record(item)?.value).filter(value => value !== undefined)
    : rawType === 'enum'
      ? Object.values(record(zod?.entries) ?? {})
      : undefined
  if (constants !== undefined && constants.length > 0) return { key, type: 'enum', choices: constants, ...extra }
  return { key, type: 'json', ...extra }
}

/** Project a Schemastery or Zod object schema; other roots use JSON fallback. */
function formSchema(source: unknown): FormSchema | undefined {
  const schema = record(source)
  if (schema === undefined) return undefined
  const zod = record(record(schema._zod)?.def) ?? record(schema._def)
  const type = typeof schema.type === 'string' ? schema.type : zod?.type
  const fields = type === 'object'
    ? record(schema.dict) ?? record(typeof zod?.shape === 'function' ? zod.shape() : zod?.shape)
    : undefined
  if (fields === undefined) return undefined
  return { fields: Object.entries(fields).flatMap(([key, field]) => {
    const result = formField(key, field)
    return result === undefined ? [] : [result]
  }) }
}

/** Only packages in the DSH namespace are exposed or installed. */
function isMarketPackageName(value: string): boolean {
  return /^(?:dsh-[a-z0-9][a-z0-9._-]*|@[a-z0-9][a-z0-9._-]*\/dsh-[a-z0-9][a-z0-9._-]*)$/.test(value)
}

/** Accept a normal npm package name after its on-disk installation is verified. */
function isPackageName(value: string): boolean {
  return /^(?:[a-z0-9][a-z0-9._-]*|@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)$/.test(value)
}

/** Read a JSON resource with an error that is safe to show in the local UI. */
async function npmJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`npm registry request failed (${response.status})`)
  return response.json()
}

/** Read a JSON file published by the curated GitHub plugin list. */
async function curatedJson(name: string): Promise<unknown> {
  const response = await fetch(`${AWESOME_DSH_RAW_URL}/${name}`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`curated plugin list request failed (${response.status})`)
  return response.json()
}

/** Turn a GitHub repository URL into the safe owner/repository pair for dsh. */
function githubRepository(value: string): { owner: string, repo: string } | undefined {
  try {
    const url = new URL(value)
    const path = url.hostname === 'github.com' ? url.pathname.split('/').filter(Boolean) : []
    if (url.protocol !== 'https:' || path.length !== 2) return undefined
    const [owner, repo] = path
    if (owner === undefined || repo === undefined) return undefined
    return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(owner) && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)
      ? { owner, repo }
      : undefined
  } catch {
    return undefined
  }
}

/** Load and merge stars, npm mapping, and added dates from the curated list. */
async function curatedPlugins(installed: ReadonlyMap<string, string>): Promise<readonly CuratedPlugin[]> {
  const withInstalled = (plugins: readonly CuratedPlugin[]) => plugins.map(plugin => {
    const installedName = installed.get(`${plugin.owner}/${plugin.repo}`)
    return { ...plugin, ...(installedName === undefined ? {} : { installedName }) }
  })
  if (curatedCache !== undefined && curatedCache.expiresAt > Date.now()) return withInstalled(curatedCache.plugins)
  const [npmMapValue, starsValue, datesValue] = await Promise.all([
    curatedJson('npm-map.json'),
    curatedJson('stars.json'),
    curatedJson('added-dates.json'),
  ])
  const npmMap = record(npmMapValue) ?? {}
  const stars = record(starsValue) ?? {}
  const dates = record(datesValue) ?? {}
  const plugins = [...new Set([...Object.keys(npmMap), ...Object.keys(stars), ...Object.keys(dates)])]
    .flatMap(url => {
      const repository = githubRepository(url)
      if (repository === undefined) return []
      const npm = record(npmMap[url])?.npm
      const starCount = record(stars[url])?.stars
      const addedAt = dates[url]
      return [{
        ...repository,
        ...(typeof npm === 'string' ? { npm } : {}),
        ...(typeof starCount === 'number' ? { stars: starCount } : {}),
        ...(typeof addedAt === 'string' ? { addedAt } : {}),
      }]
    })
    .sort((left, right) => (right.stars ?? 0) - (left.stars ?? 0) || `${left.owner}/${left.repo}`.localeCompare(`${right.owner}/${right.repo}`))
  curatedCache = { expiresAt: Date.now() + PACKAGE_CACHE_MS, plugins }
  return withInstalled(plugins)
}

/** List every unscoped package whose npm name starts with dsh-. */
async function npmPluginNames(): Promise<readonly string[]> {
  const names = new Set<string>()
  let start = 'dsh-'
  for (;;) {
    const query = new URLSearchParams({
      startkey: JSON.stringify(start),
      endkey: JSON.stringify('dsh-\ufff0'),
      limit: String(PACKAGE_PAGE_SIZE),
    })
    const value = record(await npmJson(`${NPM_REPLICATION_URL}/_all_docs?${query}`))
    const rows = Array.isArray(value?.rows) ? value.rows : []
    const page = rows.flatMap(row => {
      const id = record(row)?.id
      return typeof id === 'string' && isMarketPackageName(id) ? [id] : []
    })
    page.forEach(name => names.add(name))
    if (rows.length < PACKAGE_PAGE_SIZE) return [...names]
    const last = record(rows.at(-1))?.id
    if (typeof last !== 'string' || last <= start) return [...names]
    start = last
  }
}

/** Read the available versions and summary fields for a single npm package. */
async function npmPackageMetadata(name: string): Promise<PackageMetadata & { description?: string }> {
  const value = record(await npmJson(`${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`))
  const versions = Object.keys(record(value?.versions) ?? {}).filter(version => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
  const tags = record(value?.['dist-tags'])
  const latest = typeof tags?.latest === 'string' ? tags.latest : undefined
  return {
    versions: latest !== undefined && versions.includes(latest)
      ? [latest, ...versions.filter(version => version !== latest).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))]
      : versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true })),
    ...(latest === undefined ? {} : { latest }),
    ...(typeof value?.description === 'string' ? { description: value.description } : {}),
  }
}

/** Return the selected Web profile managed by the DSH CLI. */
function webProfileRoot(): string {
  return join(process.env.USERPROFILE ?? homedir(), '.dsh', 'profiles', 'web')
}

/** Return the installed version when the shared profile dependency exists. */
async function installedVersion(root: string, name: string): Promise<string | undefined> {
  try {
    const metadata = record(JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')))
    return typeof metadata?.version === 'string' ? metadata.version : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Read direct Web-profile dependencies that were installed from GitHub. */
async function installedGitHubPackages(root: string): Promise<ReadonlyMap<string, string>> {
  try {
    const profile = record(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')))
    const dependencies = [profile?.dependencies, profile?.devDependencies, profile?.optionalDependencies]
      .flatMap(value => Object.entries(record(value) ?? {}))
    const installed = new Map<string, string>()
    for (const [name, specifier] of dependencies) {
      if (!isPackageName(name) || typeof specifier !== 'string' || !specifier.startsWith('github:')) continue
      const repository = githubRepository(`https://github.com/${specifier.slice('github:'.length).split('#', 1)[0]}`)
      if (repository !== undefined) installed.set(`${repository.owner}/${repository.repo}`, name)
    }
    return installed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw error
  }
}

/** Find the package name recorded by dsh after a curated GitHub installation. */
async function installedGitHubPackageName(root: string, request: GitHubInstallRequest): Promise<string | undefined> {
  return (await installedGitHubPackages(root)).get(`${request.owner}/${request.repo}`)
}

/** Read and cache the npm directory, enriching it with local install state. */
async function npmPackages(root: string): Promise<readonly MarketPackage[]> {
  if (packageCache !== undefined && packageCache.expiresAt > Date.now()) return packageCache.packages
  const names = await npmPluginNames()
  const results = await Promise.allSettled(names.map(async name => {
    const [metadata, installed] = await Promise.all([npmPackageMetadata(name), installedVersion(root, name)])
    return {
      name,
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
      ...(metadata.latest === undefined ? {} : { latest: metadata.latest }),
      ...(installed === undefined ? {} : { installedVersion: installed }),
    }
  }))
  const packages = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  packageCache = { expiresAt: Date.now() + PACKAGE_CACHE_MS, packages }
  return packages
}

/** Delegate installation to DSH so its Web profile manifest stays authoritative. */
async function installDshPlugin(specifier: string): Promise<void> {
  const executable = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'dsh'
  const childArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `dsh.cmd plugin --profile web add ${specifier}`]
    : ['plugin', '--profile', 'web', 'add', specifier]
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, childArgs, {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', error => reject(new Error(`failed to start dsh: ${error.message}`)))
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`dsh failed while installing ${specifier}`)))
  })
  packageCache = undefined
}

/** Install one exact npm package version into the Web profile. */
async function installPackage(request: InstallRequest): Promise<void> {
  await installDshPlugin(`${request.name}@${request.version}`)
}

/** Install one curated GitHub repository into the Web profile. */
async function installGitHubPlugin(request: GitHubInstallRequest): Promise<void> {
  await installDshPlugin(`github:${request.owner}/${request.repo}`)
}

/** Add the market browser half to the Web kernel's authoritative boot graph. */
function injectClientBootEntry(html: string): string {
  const source = [
    '<script>',
    '(() => {',
    'const graph = window.__DSH_BOOT__;',
    "if (!graph || !Array.isArray(graph.entries) || graph.entries.some(entry => entry.id === 'dsh-plugin-market')) return;",
    "graph.entries.push({ id: 'dsh-plugin-market', url: '/plugin-market/client.js', rev: 'market', inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale'] });",
    '})();',
    '</script>',
  ].join('')
  return html.replace('</head>', `${source}</head>`)
}

/** Browser fallback for profiles that do not discover dsh.client packages. */
const BROWSER_UI = `(() => {
  const api = '/plugin-market/config';
  let entries = [], draft, panel, tab, options;
  const text = value => JSON.stringify(value ?? null, null, 2);
  const template = '<section data-dsh-market-panel hidden style="display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary,#18181b);font:13px/1.5 system-ui,sans-serif"><h2 style="margin:0;font-size:18px">插件配置</h2><p style="margin:0;color:var(--dsw-alias-label-tertiary,#52525b)">按插件导出的 Config schema 生成字段。保存只追加用户 patch；即使改回原值，仍保留显式覆盖。</p><label style="display:flex;flex-direction:column;gap:6px">插件<select style="padding:7px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit"></select></label><div data-fields style="display:flex;flex-direction:column;gap:10px"></div><label data-json-field style="display:none;flex-direction:column;gap:6px">配置（JSON）<textarea data-json rows="12" spellcheck="false" style="padding:8px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical"></textarea></label><p style="margin:0;color:var(--dsw-alias-label-tertiary,#52525b)">Cordis 会整体替换 config；表单值以当前组合配置为初始值。</p><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button data-save type="button" style="border:0;border-radius:6px;padding:8px 12px;background:#2563eb;color:#fff;cursor:pointer">保存用户覆盖</button><button data-refresh type="button" style="border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer">重新读取</button><span data-status></span></div></section>';
  const current = () => entries.find(entry => entry.id === panel.querySelector('select').value);
  const clone = value => JSON.parse(JSON.stringify(value ?? {}));
  const input = (field, value) => {
    const label = document.createElement('label'); label.style.cssText = 'display:flex;flex-direction:column;gap:5px';
    const title = document.createElement('span'); title.textContent = field.key + (field.required ? ' *' : '') + (field.description ? ' — ' + field.description : ''); label.appendChild(title);
    let control;
    if (field.type === 'boolean') { control = document.createElement('input'); control.type = 'checkbox'; control.checked = Boolean(value); control.addEventListener('change', () => { draft[field.key] = control.checked; }); }
    else if (field.type === 'enum') { control = document.createElement('select'); for (const choice of field.choices) { const option = document.createElement('option'); option.value = JSON.stringify(choice); option.textContent = String(choice); option.selected = JSON.stringify(choice) === JSON.stringify(value); control.appendChild(option); } control.addEventListener('change', () => { draft[field.key] = JSON.parse(control.value); }); }
    else if (field.type === 'json') { control = document.createElement('textarea'); control.rows = 5; control.value = text(value); control.addEventListener('change', () => { try { draft[field.key] = JSON.parse(control.value); control.setCustomValidity(''); } catch { control.setCustomValidity('必须是有效 JSON。'); } }); }
    else { control = document.createElement('input'); control.type = field.type === 'number' ? 'number' : 'text'; control.value = value ?? field.default ?? ''; control.addEventListener('change', () => { draft[field.key] = field.type === 'number' ? Number(control.value) : control.value; }); }
    control.style.cssText = 'padding:7px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit;font:inherit'; label.appendChild(control); return label;
  };
  const show = () => { const entry = current(); if (!entry) return; draft = clone(entry.config); const fields = panel.querySelector('[data-fields]'), jsonField = panel.querySelector('[data-json-field]'), json = panel.querySelector('[data-json]'); fields.replaceChildren(); if (!entry.schema?.fields?.length) { jsonField.style.display = 'flex'; json.value = text(draft); return; } jsonField.style.display = 'none'; for (const field of entry.schema.fields) fields.appendChild(input(field, draft[field.key])); };
  const status = (message, failed = false) => { const output = panel.querySelector('[data-status]'); output.textContent = message; output.style.color = failed ? '#b91c1c' : ''; };
  const load = async () => {
    status('正在读取…'); const response = await fetch(api, {cache:'no-store'}); const value = await response.json();
    if (!response.ok) throw new Error(value.error || '读取失败');
    entries = value.entries; const select = panel.querySelector('select'); select.replaceChildren(...entries.map(entry => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name + ' (' + entry.id + ')'; return option; }));
    show(); status(entries.length ? '' : '没有可编辑的插件。');
  };
  const reload = () => load().catch(error => status(error instanceof Error ? error.message : String(error), true));
  const activate = () => {
    for (const item of tab.parentElement.querySelectorAll('button')) { item.setAttribute('aria-current', item === tab ? 'true' : 'false'); item.style.background = item === tab ? 'var(--dsw-specific-sidebar-nav-item-active,#4a4c52)' : 'transparent'; }
    for (const item of options.children) if (item !== panel) item.hidden = true;
    panel.hidden = false; if (!entries.length) void reload();
  };
  const mount = () => {
    const dialog = document.querySelector('[role=dialog]'); if (!dialog) return;
    const nav = dialog.querySelector('nav'); const list = nav === null ? null : [...nav.children].find(candidate => candidate.tagName === 'DIV' && [...candidate.children].some(child => child.tagName === 'BUTTON')); const nextOptions = nav?.nextElementSibling?.lastElementChild; if (!list || !nextOptions) return;
    if (options === nextOptions && panel?.isConnected) return;
    options = nextOptions; tab = document.createElement('button'); tab.type = 'button'; tab.textContent = '插件配置'; tab.style.cssText = 'display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,#18181b);font:14px/22px inherit;text-align:left;cursor:pointer';
    panel = document.createRange().createContextualFragment(template).firstChild; list.appendChild(tab); options.appendChild(panel);
    tab.addEventListener('click', activate); list.addEventListener('click', event => { if (event.target !== tab && !tab.contains(event.target)) { panel.hidden = true; for (const item of list.querySelectorAll('button')) item.style.removeProperty('background'); for (const item of options.children) if (item !== panel) item.hidden = false; } });
    panel.querySelector('select').addEventListener('change', show); panel.querySelector('[data-refresh]').addEventListener('click', reload);
    panel.querySelector('[data-save]').addEventListener('click', async () => { const entry = current(); if (!entry) return; if (!entry.schema?.fields?.length) try { draft = JSON.parse(panel.querySelector('[data-json]').value); } catch { status('配置必须是有效 JSON。', true); return; } status('正在保存…'); try { const response = await fetch(api, {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:entry.id,config:draft})}); const value = await response.json(); if (!response.ok) throw new Error(value.error || '保存失败'); status('已保存。运行中的 profile 将自动重新加载。'); } catch (error) { status(error instanceof Error ? error.message : String(error), true); } });
  };
  new MutationObserver(mount).observe(document.body, {childList:true,subtree:true}); mount();
})();`

// Retained only for a transitional reload: the actual Settings page comes
// from the browser entry injected into __DSH_BOOT__, never from DOM mutation.
void BROWSER_UI

/** Send one no-cache JSON response. */
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

/** Refuse to reveal or alter deployment configuration through a LAN listener. */
function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Read an incoming JSON body while refusing oversized requests. */
async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.byteLength
    if (length > MAX_REQUEST_BYTES) throw new Error('configuration request exceeds 1 MiB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Narrow a browser request to the supported patch write operation. */
function saveRequest(value: unknown): SaveRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('request must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) throw new Error('request.id must be a non-empty string')
  if (!Object.hasOwn(record, 'config')) throw new Error('request.config is required')
  return { id: record.id, config: record.config }
}

/** Narrow an installation request to one exact allowed package version. */
function installRequest(value: unknown): InstallRequest {
  const source = record(value)
  if (source === undefined || !isMarketPackageName(source.name as string)) throw new Error('request.name must be a DSH plugin package')
  if (typeof source.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(source.version)) {
    throw new Error('request.version must be an exact published version')
  }
  return { name: source.name as string, version: source.version }
}

/** Narrow a curated GitHub install request to one owner/repository pair. */
function gitHubInstallRequest(value: unknown): GitHubInstallRequest {
  const source = record(value)
  const owner = typeof source?.owner === 'string' ? source.owner : undefined
  const repo = typeof source?.repo === 'string' ? source.repo : undefined
  if (owner === undefined || repo === undefined || !githubRepository(`https://github.com/${owner}/${repo}`)) {
    throw new Error('request must identify one GitHub owner and repository')
  }
  return { owner, repo }
}

/** Narrow an add-to-configuration request to an allowed installed package. */
function addPluginRequest(value: unknown): AddPluginRequest {
  const source = record(value)
  if (source === undefined || !isPackageName(source.name as string)) throw new Error('request.name must be an installed npm package')
  return { name: source.name as string }
}

/** Read a profile patch without treating a new profile as an error. */
async function readPatch(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '[]\n'
    throw error
  }
}

/**
 * Add one complete, id-targeted override without parsing or reformatting
 * earlier YAML. JSON is valid YAML, so the appended row is a Cordis patch and
 * comments plus all untouched user changes stay byte-for-byte unchanged.
 */
async function appendPatch(path: string, existing: string, request: SaveRequest): Promise<void> {
  const row = `- id: ${JSON.stringify(request.id)}\n  config: ${JSON.stringify(request.config)}\n`
  const content = existing.trim() === '[]'
    ? row
    : `${existing.endsWith('\n') ? existing : `${existing}\n`}${row}`
  const temporary = `${path}.market.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

/** Add a new Loader entry while keeping the existing user patch byte-for-byte intact. */
async function appendPluginPatch(path: string, existing: string, request: AddPluginRequest): Promise<void> {
  const row = `- insert:\n    - id: ${JSON.stringify(`market:${request.name}`)}\n      name: ${JSON.stringify(request.name)}\n`
  const content = existing.trim() === '[]'
    ? row
    : `${existing.endsWith('\n') ? existing : `${existing}\n`}${row}`
  const temporary = `${path}.market.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

/** Name exposed to Cordis. */
export const name = 'market'
/** Require only the standard Web profile services, without adding host code. */
export const inject = ['webServer', 'loader']

/**
 * Mount the standalone configuration panel and its same-origin data route.
 * @param raw - Cordis context supplied by the market Loader entry.
 */
export function apply(raw: Context): void {
  const ctx = raw as MarketContext
  if (ctx.baseUrl === undefined || !ctx.baseUrl.startsWith('file:')) {
    throw new Error('market requires a file-based Cordis profile root')
  }
  const patchPath = join(fileURLToPath(ctx.baseUrl), 'cordis.patch.yml')
  const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
  const profileRoot = webProfileRoot()
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: async (request, response) => {
      try {
        if (!isLoopback(request)) {
          json(response, 403, { error: 'plugin configuration is available only from loopback' })
          return
        }
        if (request.method === 'GET') {
          const entries = [...ctx.loader.entries()]
            .filter(entry => !entry.options.group)
            .map(entry => {
              const schema = formSchema(entry.fiber?.runtime?.Config)
              return {
                id: entry.id,
                name: entry.options.name,
                config: entry.options.config ?? null,
                ...(schema === undefined ? {} : { schema }),
              }
            })
          json(response, 200, { entries })
          return
        }
        if (request.method === 'POST') {
          const requestData = addPluginRequest(await requestBody(request))
          try {
            await access(join(profileRoot, 'node_modules', requestData.name, 'package.json'))
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              json(response, 409, { error: 'install the selected plugin before adding it to configuration' })
              return
            }
            throw error
          }
          if ([...ctx.loader.entries()].some(entry => entry.options.name === requestData.name)) {
            json(response, 409, { error: 'plugin is already present in the active configuration' })
            return
          }
          await appendPluginPatch(patchPath, await readPatch(patchPath), requestData)
          json(response, 200, { ok: true })
          return
        }
        if (request.method !== 'PUT') {
          response.writeHead(405, { allow: 'GET, POST, PUT' })
          response.end()
          return
        }
        const requestData = saveRequest(await requestBody(request))
        if (![...ctx.loader.entries()].some(entry => entry.id === requestData.id && !entry.options.group)) {
          json(response, 404, { error: 'plugin entry was not found' })
          return
        }
        await appendPatch(patchPath, await readPatch(patchPath), requestData)
        json(response, 200, { ok: true })
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'market: configuration route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PACKAGE_API_PATH,
    handler: async (request, response) => {
      try {
        if (!isLoopback(request)) {
          json(response, 403, { error: 'plugin market is available only from loopback' })
          return
        }
        if (request.method === 'GET') {
          const url = new URL(request.url ?? PACKAGE_API_PATH, 'http://localhost')
          const name = url.searchParams.get('name')
          if (name !== null) {
            if (!isMarketPackageName(name)) throw new Error('package is not in the DSH plugin namespace')
            const [metadata, installed] = await Promise.all([npmPackageMetadata(name), installedVersion(profileRoot, name)])
            json(response, 200, { name, ...metadata, ...(installed === undefined ? {} : { installedVersion: installed }) })
            return
          }
          json(response, 200, { packages: await npmPackages(profileRoot) })
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, POST' })
          response.end()
          return
        }
        const requestData = installRequest(await requestBody(request))
        const metadata = await npmPackageMetadata(requestData.name)
        if (!metadata.versions.includes(requestData.version)) throw new Error('selected package version was not found on npm')
        await installPackage(requestData)
        json(response, 200, { ok: true, installedVersion: await installedVersion(profileRoot, requestData.name) })
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'market: npm package route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CURATED_API_PATH,
    handler: async (request, response) => {
      try {
        if (!isLoopback(request)) {
          json(response, 403, { error: 'curated plugins are available only from loopback' })
          return
        }
        if (request.method === 'GET') {
          json(response, 200, { plugins: await curatedPlugins(await installedGitHubPackages(profileRoot)) })
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, POST' })
          response.end()
          return
        }
        const requestData = gitHubInstallRequest(await requestBody(request))
        await installGitHubPlugin(requestData)
        json(response, 200, { ok: true, packageName: await installedGitHubPackageName(profileRoot, requestData) })
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'market: curated GitHub route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CLIENT_PATH,
    handler: async (_request, response) => {
      try {
        const source = await readFile(clientPath)
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/javascript; charset=utf-8' })
        response.end(source)
      } catch {
        response.writeHead(404)
        response.end()
      }
    },
  }), 'market: browser client route')
  ctx.effect(() => ctx.webServer.tapIndex(injectClientBootEntry), 'market: browser boot entry')
}
