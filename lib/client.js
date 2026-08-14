/** Browser half registered by dsh.client through the Web module table. */

window.__ModuleLoader__.load({ id: 'dsh-plugin-market', factory: (require) => {
  const React = require('react')
  const { createElement: h, useEffect, useMemo, useState } = React
  const api = '/plugin-market/config'
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
    .dsh-market-button{min-height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
    .dsh-market-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .dsh-market-button--primary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff}
    .dsh-market-button--primary:hover{filter:brightness(1.05)}
    .dsh-market-error{color:var(--dsw-alias-state-error-primary)}
  `

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

  function input(field, value, update) {
    const label = `${field.key}${field.required ? ' *' : ''}${field.description ? ` — ${field.description}` : ''}`
    if (field.type === 'boolean') return h('label', { key: field.key, className: 'dsh-market-field dsh-market-field--boolean' },
      h('input', { type: 'checkbox', checked: Boolean(value), onChange: event => update(field.key, event.currentTarget.checked) }), label)
    if (field.type === 'enum') return h('label', { key: field.key, className: 'dsh-market-field' }, label,
      h('select', { className: 'dsh-market-control', value: JSON.stringify(value), onChange: event => update(field.key, JSON.parse(event.currentTarget.value)) },
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
    const refresh = () => {
      setState({ kind: 'loading' })
      void readConfig().then(value => setState({ kind: 'ready', value }), error => setState({ kind: 'error', error: String(error.message || error) }))
    }
    useEffect(refresh, [])
    const page = content => h(React.Fragment, null, h('style', null, styles), content)
    const entries = state.kind === 'ready' ? state.value.entries : []
    const entry = useMemo(() => entries.find(item => item.id === selectedId) || entries[0], [entries, selectedId])
    useEffect(() => { if (entry) { setSelectedId(entry.id); setDraft(JSON.parse(JSON.stringify(entry.config || {}))); setNotice(undefined) } }, [entry && entry.id])
    if (state.kind === 'loading') return page(h('p', { className: 'dsh-market-status' }, '正在读取插件配置…'))
    if (state.kind === 'error') return page(h('div', { className: 'dsh-market-settings' }, h('p', { className: 'dsh-market-status dsh-market-error', role: 'alert' }, state.error), h('button', { className: 'dsh-market-button', type: 'button', onClick: refresh }, '重试')))
    if (!entry) return page(h('p', { className: 'dsh-market-status' }, '没有可编辑的插件。'))
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
    const fields = entry.schema && entry.schema.fields
    return page(h('section', { className: 'dsh-market-settings' },
      h('h2', { className: 'dsh-market-heading' }, '插件配置'),
      h('p', { className: 'dsh-market-intro' }, '按插件 Config schema 生成字段。保存只追加用户 patch，即使改回原值也会保留显式覆盖。'),
      h('label', { className: 'dsh-market-field' }, '插件', h('select', { className: 'dsh-market-control', value: entry.id, onChange: event => setSelectedId(event.currentTarget.value) },
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
