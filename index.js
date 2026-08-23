/**
 * dsh-balance — Host half.
 *
 * Standard DSH plugin (namespace export: name / inject / Config / apply).
 * The Host owns every credential and upstream call; the browser client only
 * talks to two loopback-only same-origin routes exposed via `ctx.webServer`.
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-balance'
export const inject = ['webServer', 'credentials', 'timer']

export const Config = z.object({
  apiKeyRef: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  baseUrl: z.string().default('https://api.deepseek.com'),
  timeoutMs: z.number().step(1).min(1000).max(60000).default(20000),
  allowRemote: z.boolean().default(false),
})

const STATE_ROUTE = '/dsh-balance/api/state'
const CONFIG_ROUTE = '/dsh-balance/api/config'

const BASE_PRICES = {
  default: { currency: 'CNY', in: 1.5, cache: 0.05, out: 4.5, peakIn: 3.0, peakCache: 0.10, peakOut: 9.0 },
  'deepseek-v4-flash': { currency: 'CNY', in: 1.5, cache: 0.05, out: 4.5, peakIn: 3.0, peakCache: 0.10, peakOut: 9.0 },
  'deepseek-v4-flash-vision-exp': { currency: 'CNY', in: 1.5, cache: 0.05, out: 4.5, peakIn: 3.0, peakCache: 0.10, peakOut: 9.0 },
  'deepseek-v4-pro': { currency: 'CNY', in: 4.5, cache: 0.15, out: 13.5, peakIn: 9.0, peakCache: 0.30, peakOut: 27.0 },
  'mimo-v2.5': { currency: 'USD', in: 0.10, cache: 0.02, out: 0.40, peakIn: 0.10, peakCache: 0.02, peakOut: 0.40 },
  'mimo-v2.5-pro': { currency: 'USD', in: 1.00, cache: 0.20, out: 3.00, peakIn: 1.00, peakCache: 0.20, peakOut: 3.00 },
  'mimo-v2.5-pro-ultraspeed': { currency: 'USD', in: 1.00, cache: 0.20, out: 3.00, peakIn: 1.00, peakCache: 0.20, peakOut: 3.00 },
}

function isLoopbackRequest(req) {
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

function readJsonBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

const round2 = (n) => Math.round(n * 100) / 100

function tierOfTime(timeMs) {
  const b = new Date(timeMs + 8 * 3600e3)
  const day = b.getUTCDay()
  const h = b.getUTCHours()
  return day >= 1 && day <= 5 && ((h >= 9 && h < 12) || (h >= 14 && h < 18)) ? 'peak' : 'off'
}

const isExternal = (provider) => provider !== null && provider !== 'deepseek-official'

let configRuntime = {
  threshold: 10,
  spendAlert: true,
  spendThreshold: 1,
  usdRate: 7.2,
  afterTurn: true,
  every5min: true,
  prices: structuredClone(BASE_PRICES),
}

function priceOf(model, rt) { return rt.prices[model] || rt.prices.default }
function costOfAt(t, model, timeMs, rt) {
  const p = priceOf(model, rt)
  const peak = tierOfTime(timeMs) === 'peak'
  const rate = p.currency === 'USD' ? rt.usdRate : 1
  const inP = (peak ? p.peakIn : p.in) * rate
  const cacheP = (peak ? p.peakCache : p.cache) * rate
  const outP = (peak ? p.peakOut : p.out) * rate
  return round2((t.input * inP + t.cacheRead * cacheP + t.cacheWrite * inP + t.output * outP) / 1e6)
}

function foldCost(events, since) {
  const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  let cost = 0
  let costActive = 0
  let external = false
  let lastModel = null
  let lastProvider = null
  let lastSample = null
  let samples = 0
  let samplesActive = 0
  let lastCost = 0
  let lastTime = 0
  let lastTokens = null
  if (Array.isArray(events)) {
    for (const e of events) {
      if (e === null || typeof e !== 'object' || e.data === null || typeof e.data !== 'object') continue
      if (e.type === 'request/context') {
        if (e.data.model) lastModel = String(e.data.model)
        if (e.data.provider) lastProvider = String(e.data.provider)
        continue
      }
      let turn; let step; let usage
      if (e.type === 'assistant/chunk' && e.data.chunk !== null && typeof e.data.chunk === 'object' && e.data.chunk.type === 'usage') {
        turn = e.data.turn; step = e.data.step; usage = e.data.chunk.usage
      } else if (e.type === 'assistant/message' && e.data.usage !== undefined) {
        turn = e.data.turn; step = e.data.step; usage = e.data.usage
      } else continue
      if (usage === null || typeof usage !== 'object') continue
      const b = { input: usage.inputTokens || 0, cacheRead: usage.cacheReadTokens || 0, cacheWrite: usage.cacheWriteTokens || 0, output: usage.outputTokens || 0 }
      const ext = isExternal(lastProvider)
      const tms = typeof e.time === 'number' ? e.time : Date.now()
      const inActive = since === undefined || tms >= since
      const sc = costOfAt(b, lastModel, tms, configRuntime)
      const scA = inActive ? sc : 0
      if (lastSample !== null && lastSample.turn === turn && lastSample.step === step) {
        totals.input = Math.max(0, totals.input - lastSample.buckets.input + b.input)
        totals.cacheRead = Math.max(0, totals.cacheRead - lastSample.buckets.cacheRead + b.cacheRead)
        totals.cacheWrite = Math.max(0, totals.cacheWrite - lastSample.buckets.cacheWrite + b.cacheWrite)
        totals.output = Math.max(0, totals.output - lastSample.buckets.output + b.output)
        cost = Math.max(0, round2(cost - lastSample.cost + sc))
        costActive = Math.max(0, round2(costActive - lastSample.costActive + scA))
        lastSample = { turn, step, buckets: b, cost: sc, costActive: scA }
      } else {
        totals.input += b.input; totals.cacheRead += b.cacheRead; totals.cacheWrite += b.cacheWrite; totals.output += b.output
        cost = round2(cost + sc)
        costActive = round2(costActive + scA)
        lastSample = { turn, step, buckets: b, cost: sc, costActive: scA }
        samples += 1
        if (inActive) samplesActive += 1
      }
      lastCost = sc
      lastTime = tms
      lastTokens = b
      if (ext) external = true
    }
  }
  return { totals, cost, costActive, external, model: lastModel, samples, samplesActive, lastCost, lastTime, lastTokens }
}

export function apply(ctx, config) {
  const activeSince = Date.now()
  let refreshing = false
  let sessionId = undefined
  let measuredFor = undefined
  let lastBalance = null
  const state = {
    status: 'loading', balance: null, currency: 'CNY', updatedAt: 0, delta: null,
    cost: 0, costTotal: 0, tokens: null, model: null, samples: 0, samplesTotal: 0,
    external: false, spendAlert: false, lastCost: null, lastTime: 0, lastTokens: null,
    prevCost: null, prevModel: null, prevSamples: 0, prevExternal: false,
    error: '',
  }

  const patch = (p) => Object.assign(state, p)
  const snapshot = () => ({ state: { ...state }, config: structuredClone(configRuntime) })

  const applyTokens = (sid) => {
    if (!sid) return
    const sessions = ctx.get('sessions')
    if (sessions === undefined) return
    const session = sessions.get(sid)
    if (session === undefined) return
    measuredFor = sid
    const f = foldCost(session.events, activeSince)
    patch({
      tokens: f.totals, model: f.model, external: f.external,
      cost: f.costActive, costTotal: f.cost,
      samples: f.samplesActive, samplesTotal: f.samples,
      lastCost: f.samples > 0 ? f.lastCost : null, lastTime: f.lastTime, lastTokens: f.lastTokens,
      spendAlert: configRuntime.spendAlert && f.costActive >= configRuntime.spendThreshold,
    })
  }

  const computePrev = async (sid) => {
    if (!sid) return
    const sessionQuery = ctx.get('sessionQuery')
    const sessions = ctx.get('sessions')
    if (sessionQuery === undefined || sessions === undefined) return
    const cur = sessions.get(sid)
    if (cur === undefined) return
    const cwd = cur.header.cwd
    const curCreated = cur.header.createdAt
    let records
    try { records = await sessionQuery.listSessions() } catch { return }
    let prev = null
    for (const r of records) {
      if (r.header.id === sid) continue
      if (r.header.origin === 'subagent' || r.header.parentSession !== undefined) continue
      if (cwd !== undefined && cwd !== r.header.cwd) continue
      if (curCreated !== undefined && curCreated !== null && typeof r.header.createdAt === 'number' && r.header.createdAt >= curCreated) continue
      prev = r.header
      break
    }
    if (prev === null) { patch({ prevSessionId: undefined, prevCost: null, prevModel: null, prevExternal: false, prevSamples: 0 }); return }
    try {
      const load = await sessionQuery.load(prev.id)
      if (load === null || typeof load !== 'object') { patch({ prevSessionId: prev.id, prevModel: null, prevExternal: false, prevCost: null, prevSamples: 0 }); return }
      const f = foldCost(load.events, undefined)
      patch({ prevSessionId: prev.id, prevModel: f.model, prevExternal: f.external, prevCost: f.cost, prevSamples: f.samples })
    } catch {
      patch({ prevSessionId: prev.id, prevModel: null, prevExternal: false, prevCost: null, prevSamples: 0 })
    }
  }

  const fetchBalance = async () => {
    const hit = await ctx.credentials.resolve(config.apiKeyRef)
    if (hit === undefined || !hit.value) {
      patch({ status: 'unconfigured', balance: null, delta: null, error: '' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    let payload
    try {
      const resp = await fetch(`${config.baseUrl.replace(/\/+$/u, '')}/user/balance`, {
        headers: { authorization: `Bearer ${hit.value}` },
        signal: controller.signal,
      })
      payload = await resp.json()
    } finally {
      clearTimeout(timer)
    }
    if (payload === null || typeof payload !== 'object' || payload.is_available !== true || !Array.isArray(payload.balance_infos) || payload.balance_infos.length < 1) {
      throw new Error('余额接口响应格式异常')
    }
    const info = payload.balance_infos[0]
    const balance = Number(info.total_balance)
    if (!Number.isFinite(balance)) throw new Error('余额字段异常')
    const prev = lastBalance
    lastBalance = balance
    patch({
      status: 'ok', balance, currency: info.currency || 'CNY', updatedAt: Date.now(),
      delta: prev === null ? null : round2(balance - prev), error: '',
    })
  }

  const refresh = async () => {
    if (refreshing) return
    refreshing = true
    try {
      await fetchBalance()
      applyTokens(sessionId)
      await computePrev(sessionId)
    } catch (error) {
      patch({ status: 'error', error: error instanceof Error ? error.message : String(error), delta: null })
    } finally {
      refreshing = false
    }
  }

  const stateHandler = async (req, res) => {
    if (req.method !== 'GET') { sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET' }); return }
    if (!config.allowRemote && !isLoopbackRequest(req)) { sendJson(res, 403, { ok: false, code: 'FORBIDDEN', message: '仅允许本机访问' }); return }
    try {
      const url = new URL(req.url ?? STATE_ROUTE, 'http://localhost')
      const sid = url.searchParams.get('session') || sessionId
      if (sid && (measuredFor !== sid || url.searchParams.get('refresh') === '1')) {
        sessionId = sid
        applyTokens(sid)
        await computePrev(sid)
      } else if (url.searchParams.get('refresh') === '1') {
        await refresh()
      }
      sendJson(res, 200, { ok: true, ...snapshot() })
    } catch (error) {
      sendJson(res, 500, { ok: false, code: 'HOST_ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const configHandler = async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST' }); return }
    if (!config.allowRemote && !isLoopbackRequest(req)) { sendJson(res, 403, { ok: false, code: 'FORBIDDEN', message: '仅允许本机访问' }); return }
    try {
      const a = await readJsonBody(req)
      if (typeof a.threshold === 'number' && Number.isFinite(a.threshold) && a.threshold >= 0) configRuntime.threshold = a.threshold
      if (typeof a.spendAlert === 'boolean') configRuntime.spendAlert = a.spendAlert
      if (typeof a.spendThreshold === 'number' && Number.isFinite(a.spendThreshold) && a.spendThreshold >= 0) configRuntime.spendThreshold = a.spendThreshold
      if (typeof a.usdRate === 'number' && Number.isFinite(a.usdRate) && a.usdRate > 0) configRuntime.usdRate = a.usdRate
      if (typeof a.afterTurn === 'boolean') configRuntime.afterTurn = a.afterTurn
      if (typeof a.every5min === 'boolean') configRuntime.every5min = a.every5min
      if (typeof a.priceKey === 'string' && a.priceKey !== '' && a.price !== null && typeof a.price === 'object') {
        const p = a.price
        const inV = Number(p.in); const cacheV = Number(p.cache); const outV = Number(p.out)
        if (Number.isFinite(inV) && inV >= 0 && Number.isFinite(cacheV) && cacheV >= 0 && Number.isFinite(outV) && outV >= 0) {
          const cur = configRuntime.prices[a.priceKey] || structuredClone({ currency: 'CNY', in: 1.5, cache: 0.05, out: 4.5, peakIn: 3.0, peakCache: 0.10, peakOut: 9.0 })
          if (a.tier === 'peak') { cur.peakIn = inV; cur.peakCache = cacheV; cur.peakOut = outV }
          else { cur.in = inV; cur.cache = cacheV; cur.out = outV }
          configRuntime.prices[a.priceKey] = cur
        }
      }
      applyTokens(sessionId)
      await computePrev(sessionId)
      sendJson(res, 200, { ok: true, ...snapshot() })
    } catch (error) {
      sendJson(res, 500, { ok: false, code: 'HOST_ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: STATE_ROUTE, handler: stateHandler }), 'dsh-balance: state route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: CONFIG_ROUTE, handler: configHandler }), 'dsh-balance: config route')

  ctx.on('agent/turn-stopping', (payload) => {
    if (payload && payload.agent && payload.agent.id) sessionId = payload.agent.id
    if (!configRuntime.afterTurn) return
    void refresh()
  })
  ctx.interval(() => {
    if (configRuntime.every5min) void refresh()
  }, 5 * 60 * 1000)

  void refresh()
}
