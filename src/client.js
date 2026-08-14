/** Browser half registered by dsh.client through the Web module table. */

window.__ModuleLoader__.load({ id: 'dsh-plugin-market', factory: (require) => {
  const React = require('react')
  const { createElement: h, useEffect, useMemo, useState } = React
  const api = '/plugin-market/config'

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
    const style = { width: '100%', boxSizing: 'border-box' }
    if (field.type === 'boolean') return h('label', { key: field.key },
      h('input', { type: 'checkbox', checked: Boolean(value), onChange: event => update(field.key, event.currentTarget.checked) }), ' ', label)
    if (field.type === 'enum') return h('label', { key: field.key }, label,
      h('select', { value: JSON.stringify(value), onChange: event => update(field.key, JSON.parse(event.currentTarget.value)), style },
        field.choices.map(choice => h('option', { key: JSON.stringify(choice), value: JSON.stringify(choice) }, String(choice)))))
    if (field.type === 'json') return h('label', { key: field.key, style: { display: 'block' } }, label,
      h('textarea', { defaultValue: JSON.stringify(value, null, 2), rows: 5, style, onChange: event => {
        try { update(field.key, JSON.parse(event.currentTarget.value)); event.currentTarget.setCustomValidity('') }
        catch { event.currentTarget.setCustomValidity('必须是有效 JSON。') }
      } }))
    return h('label', { key: field.key, style: { display: 'block' } }, label,
      h('input', { type: field.type === 'number' ? 'number' : 'text', value: value ?? field.default ?? '', style,
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
    const entries = state.kind === 'ready' ? state.value.entries : []
    const entry = useMemo(() => entries.find(item => item.id === selectedId) || entries[0], [entries, selectedId])
    useEffect(() => { if (entry) { setSelectedId(entry.id); setDraft(JSON.parse(JSON.stringify(entry.config || {}))); setNotice(undefined) } }, [entry && entry.id])
    if (state.kind === 'loading') return h('p', null, '正在读取插件配置…')
    if (state.kind === 'error') return h('div', null, h('p', { role: 'alert' }, state.error), h('button', { type: 'button', onClick: refresh }, '重试'))
    if (!entry) return h('p', null, '没有可编辑的插件。')
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
    const fields = entry.schema && entry.schema.fields
    return h('section', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 } },
      h('h2', null, '插件配置'),
      h('p', null, '按插件 Config schema 生成字段。保存只追加用户 patch，即使改回原值也会保留显式覆盖。'),
      h('label', null, '插件', h('select', { value: entry.id, onChange: event => setSelectedId(event.currentTarget.value) },
        entries.map(item => h('option', { key: item.id, value: item.id }, `${item.name} (${item.id})`)))),
      fields && fields.length
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, fields.map(field => input(field, draft[field.key], update)))
        : h('label', null, '配置（JSON）', h('textarea', { value: JSON.stringify(draft, null, 2), rows: 12, onChange: event => {
          try { setDraft(JSON.parse(event.currentTarget.value)); event.currentTarget.setCustomValidity('') }
          catch { event.currentTarget.setCustomValidity('必须是有效 JSON。') }
        } })),
      h('p', null, 'Cordis 会整体替换 config；表单值以当前组合配置为初始值。'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('button', { type: 'button', onClick: () => { setNotice('正在保存…'); void saveConfig(entry.id, draft).then(() => setNotice('已保存。运行中的 profile 将自动重新加载。'), error => setNotice(String(error.message || error))) } }, '保存用户覆盖'),
        h('button', { type: 'button', onClick: refresh }, '重新读取'),
        notice && h('span', { role: 'status' }, notice)),
    )
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
