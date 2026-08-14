/**
 * Standalone Web configuration editor for the active DSH profile.
 *
 * It deliberately owns no marketplace behavior yet. The browser panel reads
 * the live Loader entries and appends explicit user overrides to the profile
 * patch without changing any existing line in that file.
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

const API_PATH = '/plugin-market/config'
const MAX_REQUEST_BYTES = 1024 * 1024

interface LoaderEntry {
  readonly id: string
  readonly options: {
    readonly name: string
    readonly group?: boolean | null
    readonly config?: unknown
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

/** Keep the index injection safe even when its source changes in the future. */
function scriptTag(source: string): string {
  return `<script id="dsh-plugin-market-ui">${source.replaceAll('<', '\\u003c')}</script>`
}

/** Browser implementation with no dependency on the host React application. */
const BROWSER_UI = `(() => {
  const api = '/plugin-market/config';
  const id = 'dsh-plugin-market-root';
  const css = [
    ':host{all:initial}',
    'button,input,select,textarea{font:inherit}',
    '.toggle{position:fixed;right:20px;bottom:20px;z-index:2147483647;border:0;border-radius:999px;padding:10px 14px;background:#2563eb;color:#fff;box-shadow:0 8px 24px #0004;cursor:pointer}',
    '.panel{position:fixed;right:20px;bottom:68px;z-index:2147483647;width:min(680px,calc(100vw - 40px));max-height:calc(100vh - 100px);overflow:auto;border:1px solid #d4d4d8;border-radius:12px;padding:16px;background:#fff;color:#18181b;box-shadow:0 16px 44px #0004;font:13px/1.5 system-ui,sans-serif}',
    '.panel[hidden]{display:none}.row{display:flex;flex-direction:column;gap:6px;margin-top:12px}.row select,.row textarea{box-sizing:border-box;width:100%;border:1px solid #a1a1aa;border-radius:6px;padding:8px;background:#fff;color:#18181b}.row textarea{font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}.actions{display:flex;align-items:center;gap:8px;margin-top:12px}.save{border:0;border-radius:6px;padding:8px 12px;background:#2563eb;color:#fff;cursor:pointer}.refresh{border:1px solid #a1a1aa;border-radius:6px;padding:7px 11px;background:#fff;color:#18181b;cursor:pointer}.note,.status{margin:8px 0 0;color:#52525b}.error{color:#b91c1c}',
  ].join('');
  const root = document.createElement('div'); root.id = id;
  const shadow = root.attachShadow({mode:'open'});
  shadow.innerHTML = '<style>' + css + '</style><button class="toggle" type="button">插件配置</button><section class="panel" hidden><strong>插件配置</strong><p class="note">显示当前组合配置。保存只追加用户 patch；即使改回原值，也会保留显式覆盖。</p><label class="row">插件<select></select></label><label class="row">组合后的配置（只读）<textarea class="effective" rows="10" readonly></textarea></label><label class="row">保存为用户覆盖（JSON）<textarea class="draft" rows="10" spellcheck="false"></textarea></label><p class="note">Cordis 会整体替换 config。编辑一个字段时请保留该插件其余需要的字段。</p><div class="actions"><button class="save" type="button">保存用户覆盖</button><button class="refresh" type="button">重新读取</button><span class="status"></span></div></section>';
  document.body.appendChild(root);
  const $ = (selector) => shadow.querySelector(selector);
  const toggle = $('.toggle'), panel = $('.panel'), select = $('.row select'), effective = $('.effective'), draft = $('.draft'), status = $('.status');
  let entries = [];
  const text = value => JSON.stringify(value ?? null, null, 2);
  const current = () => entries.find(entry => entry.id === select.value);
  const show = () => { const entry = current(); if (!entry) return; effective.value = text(entry.config); draft.value = text(entry.config); };
  const load = async () => {
    status.className = 'status'; status.textContent = '正在读取…';
    const response = await fetch(api, {cache:'no-store'}); const value = await response.json();
    if (!response.ok) throw new Error(value.error || '读取失败');
    entries = value.entries; select.replaceChildren(...entries.map(entry => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name + ' (' + entry.id + ')'; return option; }));
    show(); status.textContent = entries.length ? '' : '没有可编辑的插件。';
  };
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden && !entries.length) void reload(); });
  select.addEventListener('change', show);
  const reload = () => load().catch(error => { status.className = 'status error'; status.textContent = error instanceof Error ? error.message : String(error); });
  $('.refresh').addEventListener('click', reload);
  $('.save').addEventListener('click', async () => {
    const entry = current(); if (!entry) return;
    let config; try { config = JSON.parse(draft.value); } catch { status.className = 'status error'; status.textContent = '配置必须是有效 JSON。'; return; }
    status.className = 'status'; status.textContent = '正在保存…';
    try { const response = await fetch(api, {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:entry.id,config})}); const value = await response.json(); if (!response.ok) throw new Error(value.error || '保存失败'); status.textContent = '已保存。运行中的 profile 将自动重新加载。'; }
    catch (error) { status.className = 'status error'; status.textContent = error instanceof Error ? error.message : String(error); }
  });
})();`

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
            .map(entry => ({ id: entry.id, name: entry.options.name, config: entry.options.config ?? null }))
          json(response, 200, { entries })
          return
        }
        if (request.method !== 'PUT') {
          response.writeHead(405, { allow: 'GET, PUT' })
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
  ctx.effect(() => ctx.webServer.tapIndex(html => html.includes('dsh-plugin-market-ui')
    ? html
    : html.replace('</body>', `${scriptTag(BROWSER_UI)}</body>`)), 'market: configuration panel')
}
