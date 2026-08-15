/** Browser half registered by dsh.client through the Web module table. */

window.__ModuleLoader__.load({ id: 'dsh-plugin-market', factory: (require) => {
  const React = require('react')
  const { createElement: h, useEffect, useMemo, useState } = React
  const api = '/plugin-market/config'
  const packageApi = '/plugin-market/packages'
  const curatedApi = '/plugin-market/curated'
  const installedApi = '/plugin-market/installed'
  const sourcesApi = '/plugin-market/sources'
  const styles = `
    .dsh-market-settings{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary)}
    .dsh-market-heading,.dsh-market-intro,.dsh-market-note,.dsh-market-status{margin:0}
    .dsh-market-heading{font-size:18px;line-height:26px;font-weight:600}
    .dsh-market-intro,.dsh-market-note,.dsh-market-status{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
    .dsh-market-form{display:flex;flex-direction:column;gap:12px}
    .dsh-market-field{display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
    .dsh-market-field--boolean{flex-direction:row;align-items:center;gap:8px;cursor:pointer}
    .dsh-market-control{box-sizing:border-box;width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
    textarea.dsh-market-control{min-height:unset;resize:vertical;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px}
    .dsh-market-control:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
    .dsh-market-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .dsh-market-tabs{display:flex;align-items:flex-end;gap:22px;margin-top:2px;border-bottom:1px solid var(--dsw-alias-border-l2)}
    .dsh-market-button{min-height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
    .dsh-market-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .dsh-market-button--primary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff}
    .dsh-market-button--primary:hover{filter:brightness(1.05)}
    .dsh-market-button--tab{position:relative;min-height:unset;border:0;border-radius:0;padding:7px 1px 9px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
    .dsh-market-button--tab:hover,.dsh-market-button--tab[data-active=true]{background:transparent;color:var(--dsw-alias-label-primary)}
    .dsh-market-button--tab[data-active=true]::after,.dsh-market-button--tab:focus-visible::after{position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-label-primary);content:''}
    .dsh-market-button--tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px;color:var(--dsw-alias-label-primary)}
    .dsh-market-error{color:var(--dsw-alias-state-error-primary)}
    .dsh-market-catalog{display:flex;flex-direction:column;gap:12px}
    .dsh-market-package{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
    .dsh-market-package-name{font:600 14px/20px var(--ds-font-family-code);overflow-wrap:anywhere}
    .dsh-market-package-description{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
    .dsh-market-package-meta{margin:6px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
    .dsh-market-package-actions{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .dsh-market-select{box-sizing:border-box;height:32px;max-width:240px;padding:0 32px 0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;appearance:none;background-color:var(--dsw-alias-bg-layer-1);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:12px 12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer}
    .dsh-market-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
    .dsh-market-select:disabled{opacity:.6;cursor:default}
    .dsh-market-version{min-width:108px;width:auto}
    .dsh-market-package--selectable{width:100%;border:0;text-align:left;color:inherit;font:inherit;cursor:pointer}
    .dsh-market-package--selectable:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .dsh-market-dialog{position:fixed;z-index:50;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,#000 42%,transparent)}
    .dsh-market-dialog-panel{display:flex;flex-direction:column;gap:14px;box-sizing:border-box;width:min(560px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 16px 48px color-mix(in srgb,#000 28%,transparent)}
    .dsh-market-dialog-title{margin:0;font:600 16px/24px var(--ds-font-family-code);overflow-wrap:anywhere}
    .dsh-market-dialog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    @media (max-width:640px){.dsh-market-package{grid-template-columns:1fr}.dsh-market-package-actions{justify-content:flex-start}}
  `

  async function readSources() {
    const response = await fetch(sourcesApi, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取插件源失败')
    return value
  }
  async function createSource(source) {
    const response = await fetch(sourcesApi, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(source) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '添加插件源失败')
    return value
  }
  async function setSourceEnabled(id, enabled) {
    const response = await fetch(sourcesApi, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, enabled }) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '更新插件源失败')
    return value
  }
  async function removeSource(id) {
    const response = await fetch(sourcesApi, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '删除插件源失败')
  }
  async function readConfig() {
    const response = await fetch(api, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取失败')
    return value
  }

  async function saveConfig(id, config) {
    const response = await fetch(api, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, config }),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '保存失败')
  }

  async function readPackages() {
    const response = await fetch(packageApi, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取插件市场失败')
    return value.packages
  }

  async function readPackage(name) {
    const response = await fetch(`${packageApi}?name=${encodeURIComponent(name)}`, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取版本失败')
    return value
  }

  async function installPackage(name, version) {
    const response = await fetch(packageApi, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, version }),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '安装失败')
    return value
  }

  async function addPlugin(name) {
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '添加插件失败')
  }

  async function readCuratedPlugins() {
    const response = await fetch(curatedApi, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取 GitHub 精选失败')
    return value.plugins
  }

  async function installGitHubPlugin(owner, repo) {
    const response = await fetch(curatedApi, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner, repo }),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '安装 GitHub 插件失败')
    return value
  }

  async function readInstalledPlugins() {
    const response = await fetch(installedApi, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '读取已安装插件失败')
    return value.plugins
  }

  async function uninstallPlugin(name) {
    const response = await fetch(installedApi, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || '卸载失败')
  }

  function input(field, value, update) {
    const label = `${field.key}${field.required ? ' *' : ''}${field.description ? ` — ${field.description}` : ''}`
    if (field.type === 'boolean') return h('label', { key: field.key, className: 'dsh-market-field dsh-market-field--boolean' },
      h('input', { type: 'checkbox', checked: Boolean(value), onChange: event => update(field.key, event.currentTarget.checked) }), label)
    if (field.type === 'enum') return h('label', { key: field.key, className: 'dsh-market-field' }, label,
      h('select', { className: 'dsh-market-select', value: JSON.stringify(value), onChange: event => update(field.key, JSON.parse(event.currentTarget.value)) },
        field.choices.map(choice => h('option', { key: JSON.stringify(choice), value: JSON.stringify(choice) }, String(choice)))))
    if (field.type === 'json') return h('label', { key: field.key, className: 'dsh-market-field' }, label,
      h('textarea', { className: 'dsh-market-control', defaultValue: JSON.stringify(value, null, 2), rows: 5, onChange: event => {
        try { update(field.key, JSON.parse(event.currentTarget.value)); event.currentTarget.setCustomValidity('') }
        catch { event.currentTarget.setCustomValidity('必须是有效 JSON。') }
      } }))
    return h('label', { key: field.key, className: 'dsh-market-field' }, label,
      h('input', { className: 'dsh-market-control', type: field.type === 'number' ? 'number' : 'text', value: value ?? field.default ?? '',
        onChange: event => update(field.key, field.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value) }))
  }

  function MarketSettings() {
    const [state, setState] = useState({ kind: 'loading' })
    const [selectedId, setSelectedId] = useState()
    const [draft, setDraft] = useState({})
    const [notice, setNotice] = useState()
    const [mode, setMode] = useState('config')
    const [catalog, setCatalog] = useState({ kind: 'idle' })
    const [filter, setFilter] = useState('')
    const [packageName, setPackageName] = useState('')
    const [versions, setVersions] = useState({})
    const [selectedVersions, setSelectedVersions] = useState({})
    const [curated, setCurated] = useState({ kind: 'idle' })
    const [curatedNames, setCuratedNames] = useState({})
    const [installed, setInstalled] = useState({ kind: 'idle' })
    const [selectedPlugin, setSelectedPlugin] = useState()
    const [configuredNames, setConfiguredNames] = useState({})
    const [busy, setBusy] = useState()
    const [sources, setSources] = useState({ kind: 'idle' })
    const [sourceDraft, setSourceDraft] = useState({ id: '', name: '', url: '' })
    const refresh = () => {
      setState({ kind: 'loading' })
      void readConfig().then(value => setState({ kind: 'ready', value }), error => setState({ kind: 'error', error: String(error.message || error) }))
    }
    useEffect(refresh, [])
    useEffect(() => {
      if (mode !== 'market' || catalog.kind !== 'idle') return
      setCatalog({ kind: 'loading' })
      void readPackages().then(packages => setCatalog({ kind: 'ready', packages }), error => setCatalog({ kind: 'error', error: String(error.message || error) }))
    }, [mode, catalog.kind])
    useEffect(() => {
      if (mode !== 'curated' || curated.kind !== 'idle') return
      setCurated({ kind: 'loading' })
      void readCuratedPlugins().then(plugins => setCurated({ kind: 'ready', plugins }), error => setCurated({ kind: 'error', error: String(error.message || error) }))
    }, [mode, curated.kind])
    useEffect(() => {
      if (mode !== 'uninstall' || installed.kind !== 'idle') return
      setInstalled({ kind: 'loading' })
      void readInstalledPlugins().then(plugins => setInstalled({ kind: 'ready', plugins }), error => setInstalled({ kind: 'error', error: String(error.message || error) }))
    }, [mode, installed.kind])
    const page = content => h(React.Fragment, null, h('style', null, styles), content)
    const tabs = h('div', { className: 'dsh-market-tabs', role: 'tablist', 'aria-label': '插件市场' },
      h('button', { className: 'dsh-market-button dsh-market-button--tab', type: 'button', role: 'tab', 'aria-selected': mode === 'config', 'data-active': mode === 'config' ? 'true' : undefined, onClick: () => { setSelectedPlugin(undefined); setMode('config') } }, '已配置插件'),
      h('button', { className: 'dsh-market-button dsh-market-button--tab', type: 'button', role: 'tab', 'aria-selected': mode === 'market', 'data-active': mode === 'market' ? 'true' : undefined, onClick: () => { setSelectedPlugin(undefined); setMode('market') } }, '添加 npm 插件'),
      h('button', { className: 'dsh-market-button dsh-market-button--tab', type: 'button', role: 'tab', 'aria-selected': mode === 'curated', 'data-active': mode === 'curated' ? 'true' : undefined, onClick: () => { setSelectedPlugin(undefined); setMode('curated') } }, 'GitHub 精选'),
      h('button', { className: 'dsh-market-button dsh-market-button--tab', type: 'button', role: 'tab', 'aria-selected': mode === 'uninstall', 'data-active': mode === 'uninstall' ? 'true' : undefined, onClick: () => { setSelectedPlugin(undefined); setMode('uninstall') } }, '卸载插件'),
       h('button', { className: 'dsh-market-button dsh-market-button--tab', type: 'button', role: 'tab', 'aria-selected': mode === 'sources', 'data-active': mode === 'sources' ? 'true' : undefined, onClick: () => { setSelectedPlugin(undefined); setMode('sources') } }, '插件源'))
    const loadSources = () => { setSources({ kind: "loading" }); void readSources().then(value => setSources({ kind: "ready", ...value }), error => setSources({ kind: "error", error: String(error.message || error) })) }
    useEffect(() => { if (mode === "sources" && sources.kind === "idle") loadSources() }, [mode, sources.kind])
    const sourceManager = () => {
      if (sources.kind !== "ready") return h("p", { className: "dsh-market-status" }, sources.kind === "error" ? sources.error : "正在读取全局插件源…")
      const add = () => { const id = window.prompt("插件源标识"); const name = window.prompt("插件源名称"); const url = window.prompt("HTTPS manifest URL"); if (!id || !name || !url) return; void createSource({ id, name, url }).then(loadSources, error => setNotice(String(error.message || error))) }
      const installManifestPlugin = plugin => { const task = plugin.source === "npm" ? readPackage(plugin.package || plugin.name).then(detail => installPackage(plugin.package || plugin.name, plugin.version || detail.versions[0])) : (() => { const parts = new URL(plugin.repository).pathname.split("/").filter(Boolean); return installGitHubPlugin(parts[0], parts[1]) })(); void task.then(() => setNotice(plugin.name + " 已安装。"), error => setNotice(String(error.message || error))) }
      const catalogCards = sources.catalogs.flatMap(catalog => catalog.plugins.map(plugin => h("article", { key: catalog.sourceId + ":" + plugin.name, className: "dsh-market-package" }, h("div", null, h("div", { className: "dsh-market-package-name" }, plugin.displayName || plugin.name), h("p", { className: "dsh-market-package-meta" }, plugin.author + " · " + plugin.source + (plugin.star === undefined ? "" : " · ★ " + plugin.star)), h("p", { className: "dsh-market-package-description" }, plugin.description || "")), h("div", { className: "dsh-market-package-actions" }, h("button", { className: "dsh-market-button dsh-market-button--primary", type: "button", onClick: () => installManifestPlugin(plugin) }, "安装"))))
      return h("div", { className: "dsh-market-catalog" }, h("p", { className: "dsh-market-intro" }, "插件源保存在当前用户的全局 DSH 配置中。"), h("div", { className: "dsh-market-actions" }, h("button", { className: "dsh-market-button dsh-market-button--primary", type: "button", onClick: add }, "添加插件源"), h("button", { className: "dsh-market-button", type: "button", onClick: loadSources }, "刷新")), sources.sources.map(source => h("article", { key: source.id, className: "dsh-market-package" }, h("div", null, h("div", { className: "dsh-market-package-name" }, source.name), h("p", { className: "dsh-market-package-meta" }, `${source.id} · ${source.enabled ? "已启用" : "已停用"}`), h("p", { className: "dsh-market-package-description" }, source.url)), h("div", { className: "dsh-market-package-actions" }, h("button", { className: "dsh-market-button", type: "button", onClick: () => void setSourceEnabled(source.id, !source.enabled).then(loadSources) }, source.enabled ? "停用" : "启用"), h("button", { className: "dsh-market-button dsh-market-error", type: "button", onClick: () => void removeSource(source.id).then(loadSources) }, "删除")))), catalogCards, h("p", { className: "dsh-market-note" }, `已从启用插件源读取 ${sources.catalogs.reduce((total, catalog) => total + catalog.plugins.length, 0)} 个插件。`))
    }

    const entries = state.kind === 'ready' ? state.value.entries : []
    const isConfigured = name => configuredNames[name] === true || entries.some(entry => entry.name === name)
    const entry = useMemo(() => entries.find(item => item.id === selectedId) || entries[0], [entries, selectedId])
    useEffect(() => { if (entry) { setSelectedId(entry.id); setDraft(JSON.parse(JSON.stringify(entry.config || {}))); setNotice(undefined) } }, [entry && entry.id])
    const ensureVersions = pkg => {
      if (versions[pkg.name] !== undefined) return
      setVersions(current => ({ ...current, [pkg.name]: null }))
      void readPackage(pkg.name).then(detail => {
        setVersions(current => ({ ...current, [pkg.name]: detail.versions }))
        if (detail.installedVersion) setCatalog(current => current.kind === 'ready'
          ? { ...current, packages: current.packages.map(item => item.name === pkg.name ? { ...item, installedVersion: detail.installedVersion } : item) }
          : current)
      }, error => setNotice(String(error.message || error)))
    }
    const updateInstalled = (name, installedVersion) => setCatalog(current => current.kind === 'ready'
      ? { ...current, packages: current.packages.map(item => item.name === name ? { ...item, installedVersion } : item) }
      : current)
    const market = () => {
      if (catalog.kind === 'idle' || catalog.kind === 'loading') return h('p', { className: 'dsh-market-status' }, '正在从 npm 读取插件目录…')
      if (catalog.kind === 'error') return h('div', { className: 'dsh-market-actions' }, h('p', { className: 'dsh-market-status dsh-market-error', role: 'alert' }, catalog.error), h('button', { className: 'dsh-market-button', type: 'button', onClick: () => setCatalog({ kind: 'idle' }) }, '重试'))
      const query = filter.trim().toLowerCase()
      const packages = catalog.packages.filter(pkg => !query || `${pkg.name} ${pkg.description || ''}`.toLowerCase().includes(query))
      const lookup = () => {
        const name = packageName.trim()
        if (!/^(?:dsh-[a-z0-9][a-z0-9._-]*|@[a-z0-9][a-z0-9._-]*\/dsh-[a-z0-9][a-z0-9._-]*)$/.test(name)) {
          setNotice('请输入 dsh-* 或 @scope/dsh-* 包名。')
          return
        }
        setBusy('lookup')
        void readPackage(name).then(detail => {
          setVersions(current => ({ ...current, [name]: detail.versions }))
          setCatalog(current => current.kind === 'ready' && !current.packages.some(item => item.name === name)
            ? { ...current, packages: [...current.packages, { name, description: detail.description, latest: detail.latest, installedVersion: detail.installedVersion, bundle: detail.bundle }] }
            : current)
          setNotice(`${name} 已加入插件列表。`)
        }, error => setNotice(String(error.message || error))).finally(() => setBusy(undefined))
      }
      return h(React.Fragment, null,
        h('label', { className: 'dsh-market-field' }, '筛选插件', h('input', { className: 'dsh-market-control', type: 'search', value: filter, placeholder: '按包名或描述筛选', onChange: event => setFilter(event.currentTarget.value) })),
        h('div', { className: 'dsh-market-actions' },
          h('input', { className: 'dsh-market-control', type: 'text', value: packageName, placeholder: '@scope/dsh-name', onChange: event => setPackageName(event.currentTarget.value) }),
          h('button', { className: 'dsh-market-button', type: 'button', disabled: busy === 'lookup', onClick: lookup }, busy === 'lookup' ? '查询中…' : '查找范围包')),
        h('p', { className: 'dsh-market-note' }, `共 ${packages.length} 个 npm 包。点击一项查看详情、加载版本并安装；范围包可用完整包名查找。`),
        h('div', { className: 'dsh-market-catalog' }, packages.map(pkg => {
          return h('button', { key: pkg.name, className: 'dsh-market-package dsh-market-package--selectable', type: 'button', onClick: () => { ensureVersions(pkg); setSelectedPlugin({ source: 'npm', plugin: pkg }) } },
            h('div', null,
              h('div', { className: 'dsh-market-package-name' }, pkg.name),
              pkg.description && h('p', { className: 'dsh-market-package-description' }, pkg.description),
              h('p', { className: 'dsh-market-package-meta' }, [pkg.installedVersion ? `已安装 ${pkg.installedVersion}` : `最新版本 ${pkg.latest || '未知'}`, pkg.bundle && 'DSH bundle'].filter(Boolean).join(' · '))),
            h('span', { className: 'dsh-market-package-meta' }, '查看详情'))
        })),
        notice && h('p', { className: 'dsh-market-status', role: 'status' }, notice))
    }
    const curatedMarket = () => {
      if (curated.kind === 'idle' || curated.kind === 'loading') return h('p', { className: 'dsh-market-status' }, '正在读取 GitHub 精选列表…')
      if (curated.kind === 'error') return h('div', { className: 'dsh-market-actions' }, h('p', { className: 'dsh-market-status dsh-market-error', role: 'alert' }, curated.error), h('button', { className: 'dsh-market-button', type: 'button', onClick: () => setCurated({ kind: 'idle' }) }, '重试'))
      const query = filter.trim().toLowerCase()
      const plugins = curated.plugins.filter(plugin => !query || `${plugin.owner}/${plugin.repo} ${plugin.npm || ''}`.toLowerCase().includes(query))
      return h(React.Fragment, null,
        h('label', { className: 'dsh-market-field' }, '筛选精选插件', h('input', { className: 'dsh-market-control', type: 'search', value: filter, placeholder: '按仓库或 npm 包名筛选', onChange: event => setFilter(event.currentTarget.value) })),
        h('p', { className: 'dsh-market-note' }, `共 ${plugins.length} 个来自 awesome-dsh-plugin 的精选仓库。点击一项查看安装和配置详情。`),
        h('div', { className: 'dsh-market-catalog' }, plugins.map(plugin => {
          const name = `${plugin.owner}/${plugin.repo}`
          return h('button', { key: name, className: 'dsh-market-package dsh-market-package--selectable', type: 'button', onClick: () => setSelectedPlugin({ source: 'github', plugin }) },
            h('div', null,
              h('div', { className: 'dsh-market-package-name' }, `github:${name}`),
              h('p', { className: 'dsh-market-package-meta' }, [plugin.npm && `npm: ${plugin.npm}`, typeof plugin.stars === 'number' && `★ ${plugin.stars}`, plugin.addedAt && `收录于 ${plugin.addedAt}`].filter(Boolean).join(' · '))),
            h('span', { className: 'dsh-market-package-meta' }, '查看详情'))
        })),
        notice && h('p', { className: 'dsh-market-status', role: 'status' }, notice))
    }
    const uninstallMarket = () => {
      if (installed.kind === 'idle' || installed.kind === 'loading') return h('p', { className: 'dsh-market-status' }, '正在读取已安装插件…')
      if (installed.kind === 'error') return h('div', { className: 'dsh-market-actions' }, h('p', { className: 'dsh-market-status dsh-market-error', role: 'alert' }, installed.error), h('button', { className: 'dsh-market-button', type: 'button', onClick: () => setInstalled({ kind: 'idle' }) }, '重试'))
      return h(React.Fragment, null,
        h('p', { className: 'dsh-market-note' }, `共 ${installed.plugins.length} 个直接安装到 web profile 的插件。点击一项查看详情并卸载。`),
        h('div', { className: 'dsh-market-catalog' }, installed.plugins.map(plugin => h('button', { key: plugin.name, className: 'dsh-market-package dsh-market-package--selectable', type: 'button', onClick: () => setSelectedPlugin({ source: 'installed', plugin }) },
          h('div', null,
            h('div', { className: 'dsh-market-package-name' }, plugin.name),
            h('p', { className: 'dsh-market-package-meta' }, [plugin.version, plugin.bundle && 'bundle', plugin.source].filter(Boolean).join(' · '))),
          h('span', { className: 'dsh-market-package-meta' }, '查看详情')))),
        notice && h('p', { className: 'dsh-market-status', role: 'status' }, notice))
    }
    const details = () => {
      if (!selectedPlugin) return undefined
      const close = () => setSelectedPlugin(undefined)
      let content
      if (selectedPlugin.source === 'npm') {
        const pkg = selectedPlugin.plugin
        const available = versions[pkg.name]
        const version = selectedVersions[pkg.name] || pkg.installedVersion || (Array.isArray(available) ? available[0] : undefined)
        const installing = busy === `install:${pkg.name}`
        const adding = busy === `add:${pkg.name}`
        const configured = isConfigured(pkg.name)
        const install = () => {
          if (!version) return
          setBusy(`install:${pkg.name}`)
          void installPackage(pkg.name, version)
            .then(value => {
              const installedVersion = value.installedVersion || version
              updateInstalled(pkg.name, installedVersion)
              setSelectedPlugin(current => current && current.source === 'npm' ? { ...current, plugin: { ...current.plugin, installedVersion, bundle: value.bundle || current.plugin.bundle } } : current)
              setNotice(value.bundle ? `${pkg.name}@${installedVersion} 已安装，DSH 会自动激活 bundle。` : `${pkg.name}@${installedVersion} 已安装。`)
            }, error => setNotice(String(error.message || error)))
            .finally(() => setBusy(undefined))
        }
        const add = () => {
          setBusy(`add:${pkg.name}`)
          void addPlugin(pkg.name)
            .then(() => { setConfiguredNames(current => ({ ...current, [pkg.name]: true })); setNotice(`${pkg.name} 已添加到配置。运行中的 profile 将自动重新加载。`); refresh() }, error => setNotice(String(error.message || error)))
            .finally(() => setBusy(undefined))
        }
        content = h(React.Fragment, null,
          pkg.description && h('p', { className: 'dsh-market-package-description' }, pkg.description),
          h('p', { className: 'dsh-market-note' }, pkg.installedVersion ? (pkg.bundle ? `已安装 ${pkg.installedVersion}；DSH 会通过 profile manifest 自动激活此 bundle。` : `已安装 ${pkg.installedVersion}`) : '请选择版本后安装。'),
          available === null || available === undefined
            ? h('p', { className: 'dsh-market-status' }, '正在从 npm 读取全部版本…')
            : h('label', { className: 'dsh-market-field' }, '版本', h('select', { className: 'dsh-market-select dsh-market-version', value: version, onChange: event => setSelectedVersions(current => ({ ...current, [pkg.name]: event.currentTarget.value })) }, available.map(item => h('option', { key: item, value: item }, item)))),
          h('div', { className: 'dsh-market-actions' },
            h('button', { className: 'dsh-market-button', type: 'button', disabled: !version || installing, onClick: install }, installing ? '安装中…' : '安装'),
            pkg.installedVersion && !pkg.bundle && h('button', { className: 'dsh-market-button dsh-market-button--primary', type: 'button', disabled: adding || configured, onClick: add }, configured ? '已在配置中' : adding ? '添加中…' : '添加到配置')))
      } else if (selectedPlugin.source === 'github') {
        const plugin = selectedPlugin.plugin
        const name = `${plugin.owner}/${plugin.repo}`
        const packageName = curatedNames[name] || plugin.installedName
        const installing = busy === `github:${name}`
        const adding = busy === `github-add:${name}`
        const configured = packageName && isConfigured(packageName)
        const install = () => {
          setBusy(`github:${name}`)
          void installGitHubPlugin(plugin.owner, plugin.repo)
            .then(value => {
              if (value.packageName) {
                setCuratedNames(current => ({ ...current, [name]: value.packageName }))
                setSelectedPlugin(current => current && current.source === 'github' ? { ...current, plugin: { ...current.plugin, installedName: value.packageName } } : current)
              }
              setNotice(value.packageName ? `github:${name} 已安装，可添加到配置。` : `github:${name} 已安装；DSH 会自动激活其中声明的 bundle。`)
            }, error => setNotice(String(error.message || error)))
            .finally(() => setBusy(undefined))
        }
        const add = () => {
          setBusy(`github-add:${name}`)
          void addPlugin(packageName)
            .then(() => { setConfiguredNames(current => ({ ...current, [packageName]: true })); setNotice(`${packageName} 已添加到配置。运行中的 profile 将自动重新加载。`); refresh() }, error => setNotice(String(error.message || error)))
            .finally(() => setBusy(undefined))
        }
        content = h(React.Fragment, null,
          h('p', { className: 'dsh-market-package-meta' }, [plugin.npm && `npm: ${plugin.npm}`, typeof plugin.stars === 'number' && `★ ${plugin.stars}`, plugin.addedAt && `收录于 ${plugin.addedAt}`].filter(Boolean).join(' · ')),
          h('p', { className: 'dsh-market-note' }, '安装会执行 dsh plugin --profile web add github:<owner>/<repo>。'),
          h('div', { className: 'dsh-market-actions' },
            h('button', { className: 'dsh-market-button', type: 'button', disabled: installing, onClick: install }, installing ? '安装中…' : '安装'),
            packageName && h('button', { className: 'dsh-market-button dsh-market-button--primary', type: 'button', disabled: adding || configured, onClick: add }, configured ? '已在配置中' : adding ? '添加中…' : '添加到配置')))
      } else {
        const plugin = selectedPlugin.plugin
        const uninstalling = busy === `uninstall:${plugin.name}`
        const uninstall = () => {
          setBusy(`uninstall:${plugin.name}`)
          void uninstallPlugin(plugin.name)
            .then(() => {
              setInstalled(current => current.kind === 'ready' ? { ...current, plugins: current.plugins.filter(item => item.name !== plugin.name) } : current)
              setSelectedPlugin(undefined)
              setNotice(`${plugin.name} 已卸载。`)
            }, error => setNotice(String(error.message || error)))
            .finally(() => setBusy(undefined))
        }
        content = h(React.Fragment, null,
          h('p', { className: 'dsh-market-package-meta' }, [plugin.version, plugin.bundle && 'DSH bundle', plugin.source].filter(Boolean).join(' · ')),
          h('p', { className: 'dsh-market-note' }, '卸载会执行 dsh plugin --profile web remove，并更新 web profile 的依赖与 bundle 列表。'),
          h('div', { className: 'dsh-market-actions' }, h('button', { className: 'dsh-market-button dsh-market-error', type: 'button', disabled: uninstalling, onClick: uninstall }, uninstalling ? '卸载中…' : '卸载插件')))
      }
      const title = selectedPlugin.source === 'npm'
        ? selectedPlugin.plugin.name
        : selectedPlugin.source === 'github'
          ? `github:${selectedPlugin.plugin.owner}/${selectedPlugin.plugin.repo}`
          : selectedPlugin.plugin.name
      return h('div', { className: 'dsh-market-dialog', onClick: close },
        h('section', { className: 'dsh-market-dialog-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onClick: event => event.stopPropagation() },
          h('div', { className: 'dsh-market-dialog-header' }, h('h3', { className: 'dsh-market-dialog-title' }, title), h('button', { className: 'dsh-market-button', type: 'button', onClick: close }, '关闭')),
          content,
          notice && h('p', { className: 'dsh-market-status', role: 'status' }, notice)))
    }
    if (mode === 'market') return page(h(React.Fragment, null, h('section', { className: 'dsh-market-settings' }, h('h2', { className: 'dsh-market-heading' }, '添加插件'), tabs, market()), details()))
    if (mode === 'curated') return page(h(React.Fragment, null, h('section', { className: 'dsh-market-settings' }, h('h2', { className: 'dsh-market-heading' }, 'GitHub 精选插件'), tabs, curatedMarket()), details()))
    if (mode === 'uninstall') return page(h(React.Fragment, null, h('section', { className: 'dsh-market-settings' }, h('h2', { className: 'dsh-market-heading' }, '卸载插件'), tabs, uninstallMarket()), details()))
    if (mode === 'sources') return page(h('section', { className: 'dsh-market-settings' }, h('h2', { className: 'dsh-market-heading' }, '全局插件源'), tabs, sourceManager(), notice && h('p', { className: 'dsh-market-status', role: 'status' }, notice)))
    if (state.kind === 'loading') return page(h('p', { className: 'dsh-market-status' }, '正在读取插件配置…'))
    if (state.kind === 'error') return page(h('div', { className: 'dsh-market-settings' }, h('p', { className: 'dsh-market-status dsh-market-error', role: 'alert' }, state.error), h('button', { className: 'dsh-market-button', type: 'button', onClick: refresh }, '重试')))
    if (!entry) return page(h('p', { className: 'dsh-market-status' }, '没有可编辑的插件。'))
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
    const fields = entry.schema && entry.schema.fields
    return page(h('section', { className: 'dsh-market-settings' },
      h('h2', { className: 'dsh-market-heading' }, '插件配置'),
      tabs,
      h('p', { className: 'dsh-market-intro' }, '按插件 Config schema 生成字段。保存只追加用户 patch，即使改回原值也会保留显式覆盖。'),
      h('label', { className: 'dsh-market-field' }, '插件', h('select', { className: 'dsh-market-select', value: entry.id, onChange: event => setSelectedId(event.currentTarget.value) },
        entries.map(item => h('option', { key: item.id, value: item.id }, `${item.name} (${item.id})`)))),
      fields && fields.length
        ? h('div', { className: 'dsh-market-form' }, fields.map(field => input(field, draft[field.key], update)))
        : h('label', { className: 'dsh-market-field' }, '配置（JSON）', h('textarea', { className: 'dsh-market-control', value: JSON.stringify(draft, null, 2), rows: 12, onChange: event => {
          try { setDraft(JSON.parse(event.currentTarget.value)); event.currentTarget.setCustomValidity('') }
          catch { event.currentTarget.setCustomValidity('必须是有效 JSON。') }
        } })),
      h('p', { className: 'dsh-market-note' }, 'Cordis 会整体替换 config；表单值以当前组合配置为初始值。'),
      h('div', { className: 'dsh-market-actions' },
        h('button', { className: 'dsh-market-button dsh-market-button--primary', type: 'button', onClick: () => { setNotice('正在保存…'); void saveConfig(entry.id, draft).then(() => setNotice('已保存。运行中的 profile 将自动重新加载。'), error => setNotice(String(error.message || error))) } }, '保存用户覆盖'),
        h('button', { className: 'dsh-market-button', type: 'button', onClick: refresh }, '重新读取'),
        notice && h('span', { role: 'status' }, notice)),
    ))
  }

  function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'plugin-market',
      order: 16,
      label: () => '插件配置',
    }, MarketSettings))
  }

  return { inject: ['slots'], apply }
} })
