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
const MAX_REQUEST_BYTES = 1024 * 1024;
/** Keep the index injection safe even when its source changes in the future. */
function scriptTag(source) {
    return `<script id="dsh-plugin-market-ui">${source.replaceAll('<', '\\u003c')}</script>`;
}
/** Browser implementation with no dependency on the host React application. */
const BROWSER_UI = `(() => {
  const api = '/plugin-market/config';
  let entries = [], panel, tab, tablist;
  const text = value => JSON.stringify(value ?? null, null, 2);
  const template = '<section data-dsh-market-panel hidden style="display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary,#18181b);font:13px/1.5 system-ui,sans-serif"><p style="margin:0;color:var(--dsw-alias-label-tertiary,#52525b)">显示当前组合配置。保存只追加用户 patch；即使改回原值，也会保留显式覆盖。</p><label style="display:flex;flex-direction:column;gap:6px">插件<select style="padding:7px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit"></select></label><label style="display:flex;flex-direction:column;gap:6px">组合后的配置（只读）<textarea data-effective rows="10" readonly style="padding:8px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical"></textarea></label><label style="display:flex;flex-direction:column;gap:6px">保存为用户覆盖（JSON）<textarea data-draft rows="10" spellcheck="false" style="padding:8px;border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;background:transparent;color:inherit;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical"></textarea></label><p style="margin:0;color:var(--dsw-alias-label-tertiary,#52525b)">Cordis 会整体替换 config。编辑一个字段时请保留该插件其余需要的字段。</p><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button data-save type="button" style="border:0;border-radius:6px;padding:8px 12px;background:#2563eb;color:#fff;cursor:pointer">保存用户覆盖</button><button data-refresh type="button" style="border:1px solid var(--dsw-alias-border-l2,#a1a1aa);border-radius:6px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer">重新读取</button><span data-status></span></div></section>';
  const current = () => entries.find(entry => entry.id === panel.querySelector('select').value);
  const show = () => { const entry = current(); if (!entry) return; panel.querySelector('[data-effective]').value = text(entry.config); panel.querySelector('[data-draft]').value = text(entry.config); };
  const status = (message, failed = false) => { const output = panel.querySelector('[data-status]'); output.textContent = message; output.style.color = failed ? '#b91c1c' : ''; };
  const load = async () => {
    status('正在读取…'); const response = await fetch(api, {cache:'no-store'}); const value = await response.json();
    if (!response.ok) throw new Error(value.error || '读取失败');
    entries = value.entries; const select = panel.querySelector('select'); select.replaceChildren(...entries.map(entry => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name + ' (' + entry.id + ')'; return option; }));
    show(); status(entries.length ? '' : '没有可编辑的插件。');
  };
  const reload = () => load().catch(error => status(error instanceof Error ? error.message : String(error), true));
  const activate = () => {
    for (const item of tablist.querySelectorAll('[role=tab]')) item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
    for (const item of tablist.parentElement.querySelectorAll('[role=tabpanel]')) item.hidden = true;
    panel.hidden = false; if (!entries.length) void reload();
  };
  const mount = () => {
    const dialog = document.querySelector('[role=dialog]'); if (!dialog) return;
    const plugins = [...dialog.querySelectorAll('button')].find(button => /^(插件|Plugins)$/.test(button.textContent.trim())); if (!plugins) return;
    const nextTablist = dialog.querySelector('[role=tablist]'); if (!nextTablist) return;
    if (tablist === nextTablist && panel?.isConnected) return;
    tablist = nextTablist; tab = document.createElement('button'); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.textContent = '配置编辑'; tab.style.cssText = 'position:relative;border:0;padding:7px 1px 9px;background:transparent;color:var(--dsw-alias-label-tertiary,#52525b);font:inherit;font-size:13px;line-height:20px;cursor:pointer';
    panel = document.createRange().createContextualFragment(template).firstChild; tablist.appendChild(tab); tablist.parentElement.appendChild(panel);
    tab.addEventListener('click', activate); tablist.addEventListener('click', event => { if (!event.target.closest('[data-dsh-market-tab]') && event.target !== tab) panel.hidden = true; });
    panel.querySelector('select').addEventListener('change', show); panel.querySelector('[data-refresh]').addEventListener('click', reload);
    panel.querySelector('[data-save]').addEventListener('click', async () => { const entry = current(); if (!entry) return; let config; try { config = JSON.parse(panel.querySelector('[data-draft]').value); } catch { status('配置必须是有效 JSON。', true); return; } status('正在保存…'); try { const response = await fetch(api, {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:entry.id,config})}); const value = await response.json(); if (!response.ok) throw new Error(value.error || '保存失败'); status('已保存。运行中的 profile 将自动重新加载。'); } catch (error) { status(error instanceof Error ? error.message : String(error), true); } });
  };
  new MutationObserver(mount).observe(document.body, {childList:true,subtree:true}); mount();
})();`;
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
                        .map(entry => ({ id: entry.id, name: entry.options.name, config: entry.options.config ?? null }));
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
    ctx.effect(() => ctx.webServer.tapIndex(html => html.includes('dsh-plugin-market-ui')
        ? html
        : html.replace('</body>', `${scriptTag(BROWSER_UI)}</body>`)), 'market: configuration panel');
}
//# sourceMappingURL=index.js.map