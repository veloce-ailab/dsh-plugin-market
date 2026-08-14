/**
 * Standalone Web configuration editor for the active DSH profile.
 *
 * It deliberately owns no marketplace behavior yet. The browser panel reads
 * the live Loader entries and appends explicit user overrides to the profile
 * patch without changing any existing line in that file.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const API_PATH = '/plugin-market/config';
const CLIENT_PATH = '/plugin-market/client.js';
const MAX_REQUEST_BYTES = 1024 * 1024;
/** Narrow an opaque schema implementation to its enumerable metadata. */
function record(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function')
        ? value
        : undefined;
}
/** Prefer Chinese schema copy, then English, then the first available text. */
function description(value) {
    if (typeof value === 'string')
        return value;
    const localized = record(value);
    if (localized === undefined)
        return undefined;
    for (const key of ['zh', 'zh-CN', 'en', '']) {
        if (typeof localized[key] === 'string')
            return localized[key];
    }
    return Object.values(localized).find((item) => typeof item === 'string');
}
/** Convert one Schemastery/Zod leaf into a generic browser field. */
function formField(key, source) {
    const schema = record(source);
    if (schema === undefined)
        return undefined;
    const meta = record(schema.meta);
    const zod = record(record(schema._zod)?.def) ?? record(schema._def);
    const rawType = typeof schema.type === 'string' ? schema.type : zod?.type;
    const inner = schema.inner ?? zod?.innerType;
    if (rawType === 'optional' || rawType === 'nullable' || rawType === 'default') {
        const child = formField(key, inner);
        if (child === undefined)
            return undefined;
        return {
            ...child,
            required: rawType === 'optional' || rawType === 'nullable' ? false : child.required,
            ...rawType === 'default' && zod?.defaultValue !== undefined ? { default: zod.defaultValue } : {},
        };
    }
    const required = meta?.required === true;
    const fieldDescription = description(meta?.description ?? schema.description);
    const fieldDefault = meta?.default;
    const extra = {
        required,
        ...(fieldDescription === undefined ? {} : { description: fieldDescription }),
        ...(fieldDefault === undefined ? {} : { default: fieldDefault }),
    };
    if (rawType === 'string' || rawType === 'number' || rawType === 'boolean')
        return { key, type: rawType, ...extra };
    const constants = rawType === 'union' && Array.isArray(schema.list)
        ? schema.list.map(item => record(item)?.value).filter(value => value !== undefined)
        : rawType === 'enum'
            ? Object.values(record(zod?.entries) ?? {})
            : undefined;
    if (constants !== undefined && constants.length > 0)
        return { key, type: 'enum', choices: constants, ...extra };
    return { key, type: 'json', ...extra };
}
/** Project a Schemastery or Zod object schema; other roots use JSON fallback. */
function formSchema(source) {
    const schema = record(source);
    if (schema === undefined)
        return undefined;
    const zod = record(record(schema._zod)?.def) ?? record(schema._def);
    const type = typeof schema.type === 'string' ? schema.type : zod?.type;
    const fields = type === 'object'
        ? record(schema.dict) ?? record(typeof zod?.shape === 'function' ? zod.shape() : zod?.shape)
        : undefined;
    if (fields === undefined)
        return undefined;
    return { fields: Object.entries(fields).flatMap(([key, field]) => {
            const result = formField(key, field);
            return result === undefined ? [] : [result];
        }) };
}
/** Add the market browser half to the Web kernel's authoritative boot graph. */
function injectClientBootEntry(html) {
    const source = [
        '<script>',
        '(() => {',
        'const graph = window.__DSH_BOOT__;',
        "if (!graph || !Array.isArray(graph.entries) || graph.entries.some(entry => entry.id === 'dsh-plugin-market')) return;",
        "graph.entries.push({ id: 'dsh-plugin-market', url: '/plugin-market/client.js', rev: 'market', inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale'] });",
        '})();',
        '</script>',
    ].join('');
    return html.replace('</head>', `${source}</head>`);
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
})();`;
// Retained only for a transitional reload: the actual Settings page comes
// from the browser entry injected into __DSH_BOOT__, never from DOM mutation.
void BROWSER_UI;
/** Send one no-cache JSON response. */
function json(response, status, value) {
    response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
}
/** Refuse to reveal or alter deployment configuration through a LAN listener. */
function isLoopback(request) {
    const address = request.socket.remoteAddress;
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
/** Read an incoming JSON body while refusing oversized requests. */
async function requestBody(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.byteLength;
        if (length > MAX_REQUEST_BYTES)
            throw new Error('configuration request exceeds 1 MiB');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Narrow a browser request to the supported patch write operation. */
function saveRequest(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('request must be an object');
    const record = value;
    if (typeof record.id !== 'string' || record.id.length === 0)
        throw new Error('request.id must be a non-empty string');
    if (!Object.hasOwn(record, 'config'))
        throw new Error('request.config is required');
    return { id: record.id, config: record.config };
}
/** Read a profile patch without treating a new profile as an error. */
async function readPatch(path) {
    try {
        return await readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return '[]\n';
        throw error;
    }
}
/**
 * Add one complete, id-targeted override without parsing or reformatting
 * earlier YAML. JSON is valid YAML, so the appended row is a Cordis patch and
 * comments plus all untouched user changes stay byte-for-byte unchanged.
 */
async function appendPatch(path, existing, request) {
    const row = `- id: ${JSON.stringify(request.id)}\n  config: ${JSON.stringify(request.config)}\n`;
    const content = existing.trim() === '[]'
        ? row
        : `${existing.endsWith('\n') ? existing : `${existing}\n`}${row}`;
    const temporary = `${path}.market.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
}
/** Name exposed to Cordis. */
export const name = 'market';
/** Require only the standard Web profile services, without adding host code. */
export const inject = ['webServer', 'loader'];
/**
 * Mount the standalone configuration panel and its same-origin data route.
 * @param raw - Cordis context supplied by the market Loader entry.
 */
export function apply(raw) {
    const ctx = raw;
    if (ctx.baseUrl === undefined || !ctx.baseUrl.startsWith('file:')) {
        throw new Error('market requires a file-based Cordis profile root');
    }
    const patchPath = join(fileURLToPath(ctx.baseUrl), 'cordis.patch.yml');
    const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url));
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: API_PATH,
        handler: async (request, response) => {
            try {
                if (!isLoopback(request)) {
                    json(response, 403, { error: 'plugin configuration is available only from loopback' });
                    return;
                }
                if (request.method === 'GET') {
                    const entries = [...ctx.loader.entries()]
                        .filter(entry => !entry.options.group)
                        .map(entry => {
                        const schema = formSchema(entry.fiber?.runtime?.Config);
                        return {
                            id: entry.id,
                            name: entry.options.name,
                            config: entry.options.config ?? null,
                            ...(schema === undefined ? {} : { schema }),
                        };
                    });
                    json(response, 200, { entries });
                    return;
                }
                if (request.method !== 'PUT') {
                    response.writeHead(405, { allow: 'GET, PUT' });
                    response.end();
                    return;
                }
                const requestData = saveRequest(await requestBody(request));
                if (![...ctx.loader.entries()].some(entry => entry.id === requestData.id && !entry.options.group)) {
                    json(response, 404, { error: 'plugin entry was not found' });
                    return;
                }
                await appendPatch(patchPath, await readPatch(patchPath), requestData);
                json(response, 200, { ok: true });
            }
            catch (error) {
                json(response, 400, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    }), 'market: configuration route');
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: CLIENT_PATH,
        handler: async (_request, response) => {
            try {
                const source = await readFile(clientPath);
                response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/javascript; charset=utf-8' });
                response.end(source);
            }
            catch {
                response.writeHead(404);
                response.end();
            }
        },
    }), 'market: browser client route');
    ctx.effect(() => ctx.webServer.tapIndex(injectClientBootEntry), 'market: browser boot entry');
}
//# sourceMappingURL=index.js.map