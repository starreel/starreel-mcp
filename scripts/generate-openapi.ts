/**
 * OpenAPI 3.1 spec 生成器 —— 从 MCP 工具面(zod schema + handler)运行时内省生成,
 * 不手写、不静态解析源码。原理:
 *   1. 假 McpServer 收集 (name, description, zod shape);
 *   2. 按 zod 类型给每个参数造「哨兵值」(全局唯一,可在 URL 里反查);
 *   3. 假 StarReelClient 记录 handler 发出的第一笔 produce* 调用(method+path+body)后立刻中止;
 *   4. 路径里的哨兵回替成 {param} 还原路径模板;body 里出现的键即请求体字段
 *      (键在 zod shape 里 → 用 zod 转 JSON Schema;键是 handler 变换出来的 → 按哨兵结构推断)。
 *
 * 覆盖范围:仅 /v1/produce/* 门面 + /v1/agent/token 鉴权。localize 工具是多端点
 * 编排(卖结果不搬 REST),不映射成 REST 文档,排除在外。
 * 无法自动映射的工具(如需本地文件上传的)会列入 x-unmapped-tools 并在 stderr 报告——
 * 不静默截断。
 *
 * 运行:npm run generate:openapi(tsx 直跑,产出 openapi.json,info.version 取 package.json)。
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { registerProduceTools } from '../src/tools/produce.js'
import { registerGuideTools } from '../src/tools/guide.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// ---------- 1. 收集工具 ----------
type ToolReg = { name: string; description: string; shape: Record<string, z.ZodTypeAny>; handler: (args: any) => Promise<unknown> }
const tools: ToolReg[] = []
const fakeServer = {
  tool(name: string, description: string, shape: Record<string, z.ZodTypeAny>, handler: (args: any) => Promise<unknown>) {
    tools.push({ name, description, shape, handler })
  },
}

// ---------- 2. 哨兵值合成 ----------
let numSeq = 0
const NUM_BASE = 917_000_000 // 不会出现在任何真实字面量里的量级
const numToKey = new Map<string, string>()
const strToKey = new Map<string, string>()

/** zod 4 的类型标签在 `_zod.def.type`（zod 3 是 `_def.typeName`，如 'ZodOptional'）。 */
const defOf = (t: unknown): any => (t as any)?._zod?.def
const kindOf = (t: unknown): string | undefined => defOf(t)?.type

function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  let cur: any = t
  for (;;) {
    const k = kindOf(cur)
    if (k === 'optional' || k === 'nullable' || k === 'default' || k === 'prefault' || k === 'readonly') cur = defOf(cur).innerType
    else if (k === 'pipe') cur = defOf(cur).in
    else return cur
  }
}

/**
 * 请求体属性生成 schema 用：只剥 optional / default（「可省略」由 required 列表表达），**保留 nullable**。
 * 用 unwrap（连 nullable 一起剥）会让 `null = 清空` 这类文档里写明的操作在 spec 里不合法——
 * 按 spec 生成/校验的 REST 客户端发不出去（#635 Codex review：expression_hint / speed_factor 等全中）。
 */
function unwrapForSchema(t: z.ZodTypeAny): z.ZodTypeAny {
  let cur: any = t
  for (;;) {
    const k = kindOf(cur)
    if (k === 'optional' || k === 'default' || k === 'prefault') cur = defOf(cur).innerType
    else return cur
  }
}

function sentinelFor(key: string, t: z.ZodTypeAny): unknown {
  const cur: any = unwrap(t)
  const def = defOf(cur)
  switch (def?.type) {
    case 'number': {
      const v = NUM_BASE + ++numSeq
      numToKey.set(String(v), key)
      return v
    }
    case 'string': {
      const v = `__S_${key}__`
      strToKey.set(v, key)
      return v
    }
    case 'enum': return Object.values(def.entries)[0]
    case 'literal': return def.values[0]
    case 'boolean': return true
    case 'array': return [sentinelFor(key, def.element)]
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, sub] of Object.entries(cur.shape as Record<string, z.ZodTypeAny>)) out[k] = sentinelFor(`${key}.${k}`, sub)
      return out
    }
    case 'union': return sentinelFor(key, def.options[0])
    case 'record': return {}
    default: {
      const v = `__S_${key}__`
      strToKey.set(v, key)
      return v
    }
  }
}

// ---------- 3. 假 client:记录第一笔调用后中止 ----------
class Stop extends Error { constructor(public call: RecordedCall) { super('__stop__') } }
type RecordedCall = { method: string; path: string; body?: unknown }
const record = (method: string) => (path: string, body?: unknown): never => { throw new Stop({ method, path, body }) }
const fakeClient: any = {
  produceGet: record('get'),
  producePost: record('post'),
  producePostRaw: record('post'),   // 非 2xx 原样返回的变体，打的是同一个 REST 路径
  producePut: record('put'),
  produceDelete: record('delete'),
  // 走本地文件直传/本地化服务的 handler 无法映射为单一 REST 调用 → 记为 unmapped
  uploadLocalFile: () => { throw new Error('unmappable: local file upload flow') },
  uploadFile: () => { throw new Error('unmappable: local file upload flow') },
  loc: () => { throw new Error('unmappable: localization orchestration') },
  locPost: () => { throw new Error('unmappable: localization orchestration') },
}

// ---------- 4. zod 属性 → JSON Schema(剥 optional,description 保留) ----------
function propSchema(t: z.ZodTypeAny): Record<string, unknown> {
  const js: any = z.toJSONSchema(t, { target: 'draft-7', io: 'input', unrepresentable: 'any' })
  delete js.$schema
  return normalizeV3Shape(js)
}

/**
 * 把 zod 4 内置转换器的输出收敛回 zod 3 + zod-to-json-schema 时代的形状，公开 spec 不因换转换器而抖动：
 * - `.int()` 在 zod 4 里自带 ±MAX_SAFE_INTEGER 边界，转换器会写出来 —— 去掉（原 spec 没有，语义不变）；
 * - `z.record(z.string(), …)` 多出 `propertyNames.type: 'string'` —— 去掉（JSON 对象键本来就是字符串，键的 pattern 保留）；
 * - 纯字面量 union 写成 `anyOf: [{type, const}, …]` —— 收回 `{type, enum}`；
 * - 默认 strip 的对象不再写 `additionalProperties: false` —— 补回（原 spec 的约定，`.strict()` 本来就有）；
 * - nullable 外层不再继承内层的 description —— 补回（zod 3 的 `.nullable()` 会把内层描述抄到外层）。
 */
function normalizeV3Shape(node: any): any {
  if (Array.isArray(node)) return node.map(normalizeV3Shape)
  if (!node || typeof node !== 'object') return node
  const out: any = {}
  for (const [k, v] of Object.entries(node)) out[k] = normalizeV3Shape(v)
  if (out.maximum === Number.MAX_SAFE_INTEGER) delete out.maximum
  if (out.minimum === Number.MIN_SAFE_INTEGER) delete out.minimum
  if (out.propertyNames?.type === 'string') {
    delete out.propertyNames.type
    if (Object.keys(out.propertyNames).length === 0) delete out.propertyNames
  }
  if (Array.isArray(out.anyOf) && out.anyOf.length > 0 && out.anyOf.every((o: any) => o && 'const' in o && Object.keys(o).every((x) => x === 'const' || x === 'type'))) {
    const types = [...new Set(out.anyOf.map((o: any) => o.type))]
    const values = out.anyOf.map((o: any) => o.const)
    delete out.anyOf
    if (types.length === 1 && types[0]) out.type = types[0]
    out.enum = values
  }
  if (out.type === 'object' && out.properties && !('additionalProperties' in out)) out.additionalProperties = false
  if (out.description === undefined && Array.isArray(out.anyOf) && out.anyOf.length === 2 && out.anyOf[1]?.type === 'null' && Object.keys(out.anyOf[1]).length === 1 && out.anyOf[0]?.description !== undefined) {
    out.description = out.anyOf[0].description
  }
  return reorderKeys(out)
}

// 键顺序也按 zod-to-json-schema 的习惯排（type 打头、description 收尾，约束类键居中保持原序），
// 重新生成的 spec 不出整片的纯顺序 diff
const KEY_HEAD = ['type', 'anyOf']
const KEY_TAIL = ['items', 'minItems', 'maxItems', 'properties', 'required', 'additionalProperties', 'propertyNames', 'default', 'description']
function keyRank(k: string): number {
  if (KEY_HEAD.includes(k)) return KEY_HEAD.indexOf(k)
  if (KEY_TAIL.includes(k)) return 100 + KEY_TAIL.indexOf(k)
  return 50
}
function reorderKeys(node: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(node)
  return Object.fromEntries(entries.map((e, i) => ({ e, i })).sort((x, y) => keyRank(x.e[0]) - keyRank(y.e[0]) || x.i - y.i).map((x) => x.e))
}

/** handler 变换出来的键(不在 zod shape 里):按哨兵结构反推 schema。 */
function inferFromValue(v: unknown): Record<string, unknown> {
  if (typeof v === 'number') return numToKey.has(String(v)) ? { type: 'number' } : { type: 'number' }
  if (typeof v === 'string') return { type: 'string' }
  if (typeof v === 'boolean') return { type: 'boolean' }
  if (Array.isArray(v)) return { type: 'array', items: v.length ? inferFromValue(v[0]) : {} }
  if (v && typeof v === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, sub] of Object.entries(v)) props[k] = inferFromValue(sub)
    return { type: 'object', properties: props }
  }
  return {}
}

// ---------- 5. 逐工具执行 ----------
registerProduceTools(fakeServer as any, fakeClient)
registerGuideTools(fakeServer as any)   // 本地功能地图工具:没有 REST 对应面,按设计落进 x-unmapped-tools(不静默漏掉)

const ENVELOPE = {
  description: 'StarReel envelope',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: { description: 'Operation result payload' },
        },
      },
    },
  },
}

const paths: Record<string, Record<string, unknown>> = {}
const unmapped: Array<{ tool: string; reason: string }> = []
const collisions: string[] = []

for (const tool of tools) {
  const args: Record<string, unknown> = {}
  for (const [k, t] of Object.entries(tool.shape)) args[k] = sentinelFor(k, t)

  let call: RecordedCall | null = null
  try {
    await tool.handler(args)
    unmapped.push({ tool: tool.name, reason: 'handler returned without HTTP call' })
    continue
  } catch (e) {
    if (e instanceof Stop) call = e.call
    else { unmapped.push({ tool: tool.name, reason: (e as Error).message.slice(0, 120) }); continue }
  }

  // 路径模板还原 + query 参数拆分
  let [rawPath, rawQuery] = call.path.split('?')
  const pathParams: string[] = []
  for (const [sent, key] of [...numToKey.entries(), ...strToKey.entries()]) {
    for (const enc of [sent, encodeURIComponent(sent)]) {
      if (rawPath.includes(enc)) { rawPath = rawPath.split(enc).join(`{${key}}`); if (!pathParams.includes(key)) pathParams.push(key) }
    }
  }
  const queryParams: Array<{ name: string; sentKey?: string }> = []
  if (rawQuery) {
    for (const pair of rawQuery.split('&')) {
      const [qk, qv = ''] = pair.split('=')
      const dec = decodeURIComponent(qv)
      queryParams.push({ name: qk, sentKey: strToKey.get(dec) ?? numToKey.get(dec) })
    }
  }

  const parameters: unknown[] = []
  for (const p of pathParams) {
    const inShape = tool.shape[p.split('.')[0]]
    parameters.push({
      name: p, in: 'path', required: true,
      schema: inShape ? propSchema(unwrap(inShape)) : { type: 'string' },
    })
  }
  for (const q of queryParams) {
    const src = q.sentKey ? tool.shape[q.sentKey.split('.')[0]] : undefined
    parameters.push({
      name: q.name, in: 'query', required: src ? !src.isOptional() : false,
      schema: src ? propSchema(unwrap(src)) : { type: 'string' },
    })
  }

  // 请求体:以 handler 真实发出的 body 键为准
  let requestBody: unknown
  if (call.body !== undefined && call.body !== null && typeof call.body === 'object') {
    const props: Record<string, unknown> = {}
    const required: string[] = []
    for (const [k, v] of Object.entries(call.body as Record<string, unknown>)) {
      if (k in tool.shape) {
        props[k] = propSchema(unwrapForSchema(tool.shape[k]))
        if (!tool.shape[k].isOptional()) required.push(k)
      } else {
        const inferred = inferFromValue(v)
        ;(inferred as any).description = `(assembled by the client from tool args — see tool '${tool.name}')`
        props[k] = inferred
      }
    }
    requestBody = {
      required: required.length > 0,
      content: { 'application/json': { schema: { type: 'object', properties: props, ...(required.length ? { required } : {}) } } },
    }
  }

  const tag = rawPath.split('/').filter(Boolean)[0] ?? 'misc'
  const op: Record<string, unknown> = {
    operationId: tool.name,
    summary: tool.description.split(/[。.]/)[0].slice(0, 120),
    description: tool.description,
    tags: [tag],
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: { '200': ENVELOPE, '402': { description: 'Insufficient prepaid balance (never overdrafts); response carries `needed` points' } },
  }

  paths[rawPath] ??= {}
  if (paths[rawPath][call.method]) {
    collisions.push(`${call.method.toUpperCase()} ${rawPath}: ${tool.name} (kept ${(paths[rawPath][call.method] as any).operationId})`)
    const kept: any = paths[rawPath][call.method]
    kept['x-also-tools'] = [...(kept['x-also-tools'] ?? []), tool.name]
    continue
  }
  paths[rawPath][call.method] = op
}

// ---------- 6. 鉴权端点(手工声明:不在工具面里) ----------
const authPath = {
  '/v1/agent/token': {
    post: {
      operationId: 'exchange_api_key',
      summary: 'Exchange a long-lived API key for a short-lived (15 min) bearer token',
      description: 'POST your `srk_live_...` API key (created in StarReel → Settings → API Keys) to obtain a 15-minute JWT. All /v1/produce/* calls require `Authorization: Bearer <token>`. On 401, re-exchange once and replay.',
      security: [],
      servers: [{ url: 'https://api.shortreelai.com' }],
      tags: ['auth'],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['api_key'], properties: { api_key: { type: 'string', description: 'srk_live_... key; stored server-side as a hash' } } } } },
      },
      responses: {
        '200': { description: 'Token envelope', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { access_token: { type: 'string' }, expires_in: { type: 'integer' } } } } } } } },
        '401': { description: 'API key rejected (revoked or invalid)' },
      },
    },
  },
}

// ---------- 7. 组装并落盘 ----------
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'StarReel Production API',
    version: pkg.version,
    description: [
      'Turn a script into a finished, downloadable short-drama episode over REST.',
      '',
      'Pipeline: script → AI rewrite → cast/scenes/props extraction → storyboards → portraits & sheets + scene plates → keyframes → video shots → TTS → final cut (.mp4).',
      '',
      '**Billing is prepaid and agent-safe**: big-ticket stages are quote-then-generate (`quote_*` returns a `quote_id`). For video, quote == actual charge. For images the quote is a *range* — models billed per reference image are priced before those are assembled, so `estimated_points` is the upper bound (size the balance by it and a run never dies half-way) and `typical_points` is the usual cost; fixed-price models return the two equal. Insufficient balance returns 402 — nothing half-runs and the account never goes negative.',
      '',
      'Auth: exchange your API key at `POST /v1/agent/token` for a 15-minute bearer token.',
      '',
      `Generated from the @starreel/mcp v${pkg.version} tool surface (operationIds match MCP tool names 1:1).`,
    ].join('\n'),
  },
  servers: [{ url: 'https://api.shortreelai.com/v1/produce', description: 'Production facade (paths below are relative to this base)' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Short-lived token from POST /v1/agent/token' },
    },
  },
  tags: [...new Set(Object.keys(paths).map((p) => p.split('/').filter(Boolean)[0] ?? 'misc'))].sort().map((t) => ({ name: t, description: `Operations under /${t}` })),
  paths: { ...Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))), ...authPath },
  ...(unmapped.length ? { 'x-unmapped-tools': unmapped } : {}),
}
;(spec.tags as Array<{ name: string; description?: string }>).push({ name: 'auth', description: 'API-key → short-lived bearer token exchange' })

writeFileSync(join(ROOT, 'openapi.json'), JSON.stringify(spec, null, 2) + '\n')

const opCount = Object.values(paths).reduce((n, m) => n + Object.keys(m).length, 0)
console.log(`✅ openapi.json: ${opCount} operations from ${tools.length} tools (${unmapped.length} unmapped)`)
if (unmapped.length) console.error('⚠ unmapped tools (documented in x-unmapped-tools):\n' + unmapped.map((u) => `  - ${u.tool}: ${u.reason}`).join('\n'))
if (collisions.length) console.error('⚠ path collisions (merged into x-also-tools):\n' + collisions.map((c) => `  - ${c}`).join('\n'))
