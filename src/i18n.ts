/**
 * MCP 包的语言开关。
 *
 * 背景（2026-10-14 多语言评估）：约 230 个工具的 description 与 server instructions 全中文，
 * 返回给 agent 的 hint / next_step 也是中文，没有任何开关；海外 agent 客户看到的是中文工具说明。
 *
 * 开关：环境变量 STARREEL_MCP_LANG（zh-CN 默认 / en）。`claude mcp add starreel -e STARREEL_MCP_LANG=en …`
 *
 * 机制：
 *   - 工具描述：index.ts 在注册前把 server.tool 包一层（patchToolDescriptions），按工具名查
 *     src/i18n/tools.en.json；查不到回中文原文——所以 en 永远可用，只是没翻的工具仍显示中文。
 *     英文描述由 scripts/i18n-translate-tools.mjs 机翻产出（key 只经环境变量传入），
 *     scripts/i18n-extract-tools.mjs 抽当前全部中文描述做源表。
 *   - server instructions：src/i18n/instructions.en.md 存在即用，否则中文。
 *   - 请求头：client.ts 按语言带 Accept-Language，后端 ui-i18n 据此挑 label 语言。
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type McpLang = 'zh-CN' | 'en'

export function resolveMcpLang(raw: string | undefined = process.env.STARREEL_MCP_LANG): McpLang {
  const v = String(raw || '').trim().toLowerCase()
  if (!v) return 'zh-CN'
  return v.startsWith('zh') ? 'zh-CN' : 'en'
}

export const MCP_LANG: McpLang = resolveMcpLang()

/** 发给门面的 Accept-Language（后端 ui-i18n 只认语言族：zh 族中文，其余英文） */
export function acceptLanguageFor(lang: McpLang = MCP_LANG): string {
  return lang === 'en' ? 'en-US' : 'zh-CN'
}

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

type DescMap = Record<string, string>
let enDescs: DescMap | null = null

/** 英文工具描述表（src/i18n/tools.en.json → 打包后 dist/i18n/tools.en.json）。缺文件 = 空表。 */
export function loadEnDescriptions(): DescMap {
  if (enDescs) return enDescs
  for (const p of [join(HERE, 'i18n', 'tools.en.json'), join(HERE, '..', 'src', 'i18n', 'tools.en.json')]) {
    if (existsSync(p)) {
      try { enDescs = require(p) as DescMap; return enDescs } catch { /* 坏文件当空表 */ }
    }
  }
  enDescs = {}
  return enDescs
}

/** 按语言取工具描述：en 且有译文 → 译文；否则中文原文 */
export function toolDescription(name: string, zh: string, lang: McpLang = MCP_LANG): string {
  if (lang !== 'en') return zh
  const en = loadEnDescriptions()[name]
  return typeof en === 'string' && en.trim() ? en : zh
}

/** en 模式下的覆盖统计：注册了多少工具、其中多少有英文描述（index.ts 启动时打到 stderr，缺译文不许静默） */
export const i18nStats = { registered: 0, translated: 0 }

/**
 * 把 McpServer.tool 包一层，注册时按工具名替换描述。零侵入：229 处 server.tool(name, desc, …) 一行不改。
 * 只在 lang=en 时才包（zh-CN 走原方法，逐字节不变）。
 */
export function patchToolDescriptions<T extends { tool: (...args: any[]) => any }>(server: T, lang: McpLang = MCP_LANG): T {
  if (lang !== 'en') return server
  const orig = server.tool.bind(server)
  ;(server as any).tool = (name: string, ...rest: any[]) => {
    if (typeof rest[0] === 'string') {
      const en = toolDescription(name, rest[0], lang)
      i18nStats.registered++
      if (en !== rest[0]) i18nStats.translated++
      rest[0] = en
    }
    return orig(name, ...rest)
  }
  return server
}

/** 启动日志用：en 模式下英文目录覆盖了多少；没覆盖的工具显示中文原文（永不空），但要让接入方看得见 */
export function describeCoverage(lang: McpLang = MCP_LANG): string {
  if (lang !== 'en') return ''
  const { registered, translated } = i18nStats
  if (!registered) return 'lang=en'
  const pct = Math.round((translated / registered) * 100)
  return translated === registered
    ? `lang=en (${translated}/${registered} tool descriptions in English)`
    : `lang=en ⚠ English catalog ${translated}/${registered} (${pct}%) — untranslated tools show Chinese; run scripts/i18n-translate-tools.mjs`
}

/** server instructions：en 且 src/i18n/instructions.en.md 存在 → 用它；否则中文 */
export function instructionsFor(zh: string, lang: McpLang = MCP_LANG): string {
  if (lang !== 'en') return zh
  for (const p of [join(HERE, 'i18n', 'instructions.en.md'), join(HERE, '..', 'src', 'i18n', 'instructions.en.md')]) {
    if (existsSync(p)) {
      const txt = readFileSync(p, 'utf8').trim()
      if (txt) return txt
    }
  }
  return zh
}
