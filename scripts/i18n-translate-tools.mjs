#!/usr/bin/env node
/**
 * i18n-translate-tools.mjs — 工具描述 + instructions 的英文机翻初稿。
 *
 *   node scripts/i18n-extract-tools.mjs                       # 先抽中文源表
 *   TRANSLATE_API_KEY=… node scripts/i18n-translate-tools.mjs  # → src/i18n/tools.en.json + instructions.en.md
 *
 * - key 只经环境变量传入，不落盘、不回显（与前端 / 官网机翻脚本同约定）
 * - 描述里的工具名（snake_case）、字段名、端点路径、模型名、点数数字必须原样保留——校验：
 *   源串里出现的每个 [a-z_]{3,}（看起来像标识符的 token）与数字都要在译文里出现，否则该工具回退中文（留缺）
 * - --resume 跳过已翻的
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', 'src', 'i18n')
const API_KEY = process.env.TRANSLATE_API_KEY
const BASE_URL = process.env.TRANSLATE_BASE_URL ?? 'https://api.openai.com/v1'
const MODEL = process.env.TRANSLATE_MODEL ?? 'gpt-5-mini'
const RESUME = process.argv.includes('--resume')
if (!API_KEY) { console.error('缺 TRANSLATE_API_KEY'); process.exit(1) }

const SYSTEM = `You translate MCP tool descriptions of StarReel (an AI short-drama production pipeline: script → rewrite → assets → storyboards → frames → video → audio → final cut) from Chinese into concise, precise technical English for an AI agent reading a tool catalog.
Hard rules:
1. Keep every tool name (snake_case like generate_frames), field name, endpoint path, model/engine name (Seedance 2.5, MiniMax H3, Nano Banana…), number and credit figure exactly as-is.
2. Keep the ★ / ⚠️ / → markers and the overall structure; keep it as dense as the source — agents read hundreds of these.
3. Brand: 星剧梦工厂 → StarReel. 点数 → credits. 镜 → shot. 分镜 → storyboard. 定妆图 → character sheet. 成片 → final cut. 报价 → quote.
4. Output ONLY a JSON object mapping each key to its English translation.`

/** @param {string} user */
async function chat(user) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, max_completion_tokens: 16000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = /** @type {{ choices?: { message?: { content?: string } }[] }} */ (await res.json())
  return data.choices?.[0]?.message?.content ?? ''
}

/** 标识符 / 数字保留判据 @param {string} src @param {unknown} dst */
function keepsTokens(src, dst) {
  if (typeof dst !== 'string' || !dst.trim()) return false
  const idents = [...new Set(src.match(/\b[a-z][a-z0-9_]{2,}\b/g) ?? [])]
  const nums = [...new Set(src.match(/\d+(?:\.\d+)?/g) ?? [])]
  return idents.every(t => dst.includes(t)) && nums.every(n => dst.includes(n))
}

const src = /** @type {Record<string, string>} */ (JSON.parse(readFileSync(join(DIR, 'tools.zh-CN.json'), 'utf8')))
const outPath = join(DIR, 'tools.en.json')
/** @type {Record<string, string>} */
const out = RESUME && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {}
const todo = Object.entries(src).filter(([k]) => !(k in out))
console.error(`工具 ${Object.keys(src).length}，待翻 ${todo.length}`)
/** @type {string[]} */ const failed = []
const BATCH = 12
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  try {
    const parsed = JSON.parse(await chat(JSON.stringify(Object.fromEntries(batch))))
    for (const [k, zh] of batch) {
      if (keepsTokens(zh, parsed?.[k])) out[k] = parsed[k]; else failed.push(k)
    }
  } catch (e) { console.error(`批 ${i / BATCH} 失败: ${String(e).slice(0, 120)}`); failed.push(...batch.map(([k]) => k)) }
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')
  console.error(`  进度 ${Math.min(i + BATCH, todo.length)}/${todo.length}，回退 ${failed.length}`)
}
// instructions 整段翻
const instrZh = join(DIR, 'instructions.zh-CN.md')
if (existsSync(instrZh)) {
  try {
    const parsed = JSON.parse(await chat(JSON.stringify({ instructions: readFileSync(instrZh, 'utf8') })))
    if (keepsTokens(readFileSync(instrZh, 'utf8'), parsed?.instructions)) writeFileSync(join(DIR, 'instructions.en.md'), parsed.instructions.trim() + '\n')
    else console.error('instructions 译文丢了标识符，未写入')
  } catch (e) { console.error(`instructions 失败: ${String(e).slice(0, 120)}`) }
}
writeFileSync(join(HERE, 'i18n-translate-tools.report.json'), JSON.stringify({ model: MODEL, translated: Object.keys(out).length, failed }, null, 2) + '\n')
console.error(`完成：译 ${Object.keys(out).length}，回退 ${failed.length}（见 report）`)
