window.__ModuleLoader__.load({
	id: "@yyfather/dsh-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

/**
 * dsh-balance — Client half (browser).
 *
 * Registers the ambient composition dock readout. All data comes from the
 * Host's loopback-only same-origin routes; no credential ever reaches the page.
 */
const React = require("react");

var inject = ["slots"];

const STATE_ROUTE = '/dsh-balance/api/state'
const CONFIG_ROUTE = '/dsh-balance/api/config'

const CSS = [
  '.dsh-balance-dock{position:relative;display:inline-flex}',
  '.dsh-balance-dock-line{font-size:12px;opacity:.85;white-space:nowrap}',
  '.dsh-balance-dock-line.warn{opacity:1;color:#f59e0b;font-weight:500;background:rgba(245,158,11,.13);border:1px solid rgba(245,158,11,.35);border-radius:999px;padding:1px 8px}',
  '.dsh-balance-pop{position:absolute;bottom:calc(100% + 10px);left:0;z-index:60;background:var(--dsh-panel-bg,#1f1f1f);color:var(--dsh-text,#e8e8e8);border:1px solid rgba(128,128,128,.35);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:12px;white-space:nowrap;min-width:280px;box-shadow:0 8px 28px rgba(0,0,0,.4)}',
  '.dsh-balance-pop .title-row{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:12.5px;opacity:.95}',
  '.dsh-balance-pop .xbtn{border:none;background:none;color:inherit;opacity:.6;cursor:pointer;font-size:12px;padding:0}',
  '.dsh-balance-pop label{display:flex;gap:8px;align-items:center;justify-content:space-between}',
  '.dsh-balance-pop .field-name{opacity:.8}',
  '.dsh-balance-pop input[type=number]{width:72px;font-size:12px;background:rgba(128,128,128,.08);color:inherit;border:1px solid rgba(128,128,128,.4);border-radius:6px;padding:3px 8px}',
  '.dsh-balance-pop input[type=checkbox]{accent-color:#f59e0b}',
  '.dsh-balance-pop select{font-size:12px;max-width:200px;background:rgba(128,128,128,.08);color:inherit;border:1px solid rgba(128,128,128,.4);border-radius:6px;padding:3px 6px}',
  '.dsh-balance-bar{width:100%;height:5px;background:rgba(128,128,128,.22);border-radius:999px;overflow:hidden}',
  '.dsh-balance-bar>div{height:100%;background:#f59e0b;border-radius:999px;transition:width .3s}',
  '.dsh-balance-pop .actions{display:flex;gap:8px;align-items:center}',
  '.dsh-balance-pop .actions button{font-size:12px;border-radius:6px;padding:3px 12px;cursor:pointer;border:1px solid rgba(128,128,128,.4);background:rgba(128,128,128,.1);color:inherit}',
  '.dsh-balance-pop .actions button.primary{background:#f59e0b;color:#1a1a1a;font-weight:600;border:none}',
  '.dsh-balance-pop .muted{opacity:.65}',
  '.dsh-balance-pop .section{border-top:1px solid rgba(128,128,128,.25);padding-top:8px}',
].join('')

const symbolOf = (currency) => currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : (currency || '') + ' '

async function loadState(sessionId, force, signal) {
  const params = new URLSearchParams()
  if (sessionId) params.set('session', sessionId)
  if (force) params.set('refresh', '1')
  const qs = params.toString()
  const resp = await fetch(STATE_ROUTE + (qs ? '?' + qs : ''), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    ...signal ? { signal } : {},
  })
  const value = await resp.json()
  if (value === null || typeof value !== 'object' || value.ok !== true) {
    throw new Error((value && value.message) || 'Host 响应异常')
  }
  return value
}

async function saveConfig(patch) {
  const resp = await fetch(CONFIG_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(patch),
  })
  const value = await resp.json()
  if (value === null || typeof value !== 'object' || value.ok !== true) {
    throw new Error((value && value.message) || 'Host 响应异常')
  }
  return value
}

function BalancePanel(props) {
  const data = props.data
  const st = data.state || {}
  const cfg = data.config || {}
  const [spendThreshold, setSpendThreshold] = React.useState(String(cfg.spendThreshold ?? 1))
  const [spendAlert, setSpendAlert] = React.useState(cfg.spendAlert !== false)
  const [threshold, setThreshold] = React.useState(String(cfg.threshold ?? 10))
  const [priceKey, setPriceKey] = React.useState('default')
  const [tierEdit, setTierEdit] = React.useState('off')
  const [priceIn, setPriceIn] = React.useState('1.5')
  const [priceCache, setPriceCache] = React.useState('0.05')
  const [priceOut, setPriceOut] = React.useState('4.5')
  const [usdRate, setUsdRate] = React.useState(String(cfg.usdRate ?? 7.2))
  const active = st.cost || 0
  const thr = Math.max(0, Number(spendThreshold) || 1)
  const pct = thr > 0 ? Math.min(100, Math.round(active / thr * 100)) : 0
  const over = thr > 0 && active >= thr
  const keys = cfg.prices ? Object.keys(cfg.prices) : ['default']
  const labelOf = (k) => {
    const p = (cfg.prices && (cfg.prices[k] || cfg.prices.default)) || {}
    return k === 'default' ? '默认' : k + (p.currency === 'USD' ? ' ($)' : '')
  }
  const syncPrice = (key, tier) => {
    const p = (cfg.prices && (cfg.prices[key] || cfg.prices.default)) || {}
    const t = tier === 'peak' ? { in: p.peakIn, cache: p.peakCache, out: p.peakOut } : { in: p.in, cache: p.cache, out: p.out }
    setPriceIn(String(t.in ?? 1.5)); setPriceCache(String(t.cache ?? 0.05)); setPriceOut(String(t.out ?? 4.5))
  }
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d }
  const save = () => {
    const rt = Number(usdRate)
    saveConfig({
      threshold: num(threshold, 10),
      spendAlert,
      spendThreshold: num(spendThreshold, 1),
      usdRate: Number.isFinite(rt) && rt > 0 ? rt : 7.2,
      priceKey: priceKey || 'default',
      tier: tierEdit === 'peak' ? 'peak' : 'off',
      price: { in: num(priceIn, 1.5), cache: num(priceCache, 0.05), out: num(priceOut, 4.5) },
    }).then((v) => { if (props.onChanged) props.onChanged(v) }).catch(() => {})
  }
  const refresh = () => {
    loadState(props.sessionId, true).then((v) => { if (props.onChanged) props.onChanged(v) }).catch(() => {})
  }
  return React.createElement('div', { className: 'dsh-balance-pop' },
    React.createElement('div', { className: 'title-row' },
      React.createElement('span', null, '余额开销设置'),
      React.createElement('button', { className: 'xbtn', onClick: props.onClose }, '✕')
    ),
    React.createElement('label', null,
      React.createElement('span', { className: 'field-name' }, '花费提醒线 ¥'),
      React.createElement('input', { type: 'number', min: 0, step: 0.1, value: spendThreshold, onChange: (e) => setSpendThreshold(e.target.value) })
    ),
    React.createElement('label', null,
      React.createElement('span', { className: 'field-name' }, '启用花费提醒（按本次活跃）'),
      React.createElement('input', { type: 'checkbox', checked: spendAlert, onChange: (e) => setSpendAlert(e.target.checked) })
    ),
    React.createElement('div', { className: 'dsh-balance-bar' }, React.createElement('div', { style: { width: pct + '%' } })),
    React.createElement('span', { className: 'muted' }, '本次活跃 ' + symbolOf(st.currency || 'CNY') + String(active) + ' / ' + symbolOf(st.currency || 'CNY') + String(thr) + (over ? ' ⚠ 已超线' : '')),
    React.createElement('label', null,
      React.createElement('span', { className: 'field-name' }, '余额提醒线 ¥'),
      React.createElement('input', { type: 'number', min: 0, step: 1, value: threshold, onChange: (e) => setThreshold(e.target.value) })
    ),
    React.createElement('div', { className: 'section' },
      React.createElement('label', null,
        React.createElement('span', { className: 'field-name' }, '模型价目'),
        React.createElement('select', { value: priceKey, onChange: (e) => { setPriceKey(e.target.value); syncPrice(e.target.value, tierEdit) } }, keys.map((k) => React.createElement('option', { value: k, key: k }, labelOf(k))))
      ),
      React.createElement('label', null,
        React.createElement('span', { className: 'field-name' }, '时段'),
        React.createElement('select', { value: tierEdit, onChange: (e) => { setTierEdit(e.target.value); syncPrice(priceKey, e.target.value) } },
          React.createElement('option', { value: 'off' }, '空闲'), React.createElement('option', { value: 'peak' }, '高峰'))
      ),
      React.createElement('label', null,
        React.createElement('span', { className: 'field-name' }, '输入/缓存/输出 ¥每百万'),
        React.createElement('span', { style: { display: 'inline-flex', gap: 4 } },
          React.createElement('input', { type: 'number', min: 0, step: 0.01, value: priceIn, onChange: (e) => setPriceIn(e.target.value) }),
          React.createElement('input', { type: 'number', min: 0, step: 0.01, value: priceCache, onChange: (e) => setPriceCache(e.target.value) }),
          React.createElement('input', { type: 'number', min: 0, step: 0.01, value: priceOut, onChange: (e) => setPriceOut(e.target.value) })
        )
      ),
      React.createElement('label', null,
        React.createElement('span', { className: 'field-name' }, '美元汇率 ¥/$'),
        React.createElement('input', { type: 'number', min: 0, step: 0.1, value: usdRate, onChange: (e) => setUsdRate(e.target.value) })
      )
    ),
    React.createElement('div', { className: 'actions' },
      React.createElement('button', { className: 'primary', onClick: save }, '保存'),
      React.createElement('button', { onClick: refresh }, '立即刷新')
    ),
    React.createElement('span', { className: 'muted' }, '本次活跃 = 自本次插件启用以来的新花费；本会话 = 当前会话全部花费')
  )
}

function BalanceDock(props) {
  const sessionId = props && props.sessionId
  const [data, setData] = React.useState(null)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    const load = (force) => {
      loadState(sessionId, force).then((v) => { if (alive) setData(v) }).catch(() => { if (alive) setData({ state: { status: 'error', error: '连接失败' } }) })
    }
    load(false)
    const timer = window.setInterval(() => load(false), 5000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [sessionId])
  if (data === null) return null
  const st = data.state || {}
  const cfg = data.config || {}
  const below = st.status === 'ok' && !st.external && typeof st.balance === 'number' && st.balance < (cfg.threshold ?? 10)
  const costWarn = st.status === 'ok' && st.spendAlert === true
  const warn = below || costWarn
  let text
  if (st.status === 'loading') text = '余额 …'
  else if (st.status === 'unconfigured') text = '余额未配置'
  else if (st.status === 'error') text = '余额获取失败'
  else if (warn) {
    const pieces = []
    if (costWarn) pieces.push('本次活跃 ' + symbolOf(st.currency) + String(st.cost || 0) + '/' + symbolOf(st.currency) + String(cfg.spendThreshold ?? 1))
    if (below) pieces.push('余额 ' + symbolOf(st.currency) + String(st.balance) + '/' + symbolOf(st.currency) + String(cfg.threshold ?? 10))
    text = '⚠ ' + pieces.join(' · ')
  } else {
    const total = st.costTotal || 0
    const active = st.cost || 0
    const last = st.lastCost !== null && st.lastCost !== undefined ? st.lastCost : null
    const prev = st.prevCost !== null && st.prevCost !== undefined ? st.prevCost : null
    text = ''
    if (!st.external) text += '余额 ' + symbolOf(st.currency) + String(st.balance) + ' · '
    text += '本会话 ' + symbolOf(st.currency) + String(total)
    text += ' · 本次活跃 ' + symbolOf(st.currency) + String(active)
    if (last !== null) text += ' · 最近一次 ' + symbolOf(st.currency) + String(last)
    if (prev !== null) text += ' · 上次对话 ' + symbolOf(st.currency) + String(prev)
  }
  let title = ''
  if (st.status === 'ok') {
    const total = st.costTotal || 0
    const active = st.cost || 0
    const last = st.lastCost !== null && st.lastCost !== undefined ? st.lastCost : null
    const prev = st.prevCost !== null && st.prevCost !== undefined ? st.prevCost : null
    title = st.external ? '当前会话为小米 MiMo 计费（不适用 DeepSeek 余额）' : 'DeepSeek 账户余额 ' + (st.currency || '') + ' · 更新于 ' + new Date(st.updatedAt || Date.now()).toLocaleTimeString()
    if (st.tokens) title += ' · 本会话token: 输入 ' + st.tokens.input + ' · 缓存读 ' + st.tokens.cacheRead + ' · 输出 ' + st.tokens.output
    title += ' · 本会话(' + (st.model || '默认') + ') ' + symbolOf(st.currency) + total + ' · 本次活跃 ' + symbolOf(st.currency) + active + ' (' + (st.samples || 0) + '次新请求)'
    if (last !== null) title += ' · 最近一次 ' + symbolOf(st.currency) + last
    if (prev !== null) title += ' · 上次对话(' + (st.prevModel || '默认') + ') ' + symbolOf(st.currency) + prev
    if (costWarn) title += ' · ⚠ 本次活跃 ≥ ' + symbolOf(st.currency) + String(cfg.spendThreshold ?? 1)
    if (below) title += ' · ⚠ 余额 < ' + symbolOf(st.currency) + String(cfg.threshold ?? 10)
  } else if (st.status === 'unconfigured') {
    title = '未找到 DEEPSEEK_API_KEY，请在 设置 → 模型 中配置'
  } else if (st.status === 'error') {
    title = st.error || '查询失败'
  }
  return React.createElement('div', { className: 'dsh-balance-dock', title },
    React.createElement('span', {
      className: 'dsh-balance-dock-line' + (warn ? ' warn' : ''),
      onClick: () => setOpen(!open),
      style: { cursor: 'pointer' },
    }, text),
    open ? React.createElement(BalancePanel, { data, sessionId, onChanged: setData, onClose: () => setOpen(false) }) : null
  )
}

function apply(ctx) {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-balance'
    style.textContent = CSS
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-balance: styles')

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'dsh-balance',
    order: 10,
    inject: () => ({ loadState, saveConfig }),
  }, BalanceDock))
}


		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
