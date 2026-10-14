#!/usr/bin/env node
/**
 * i18n-extract-tools.mjs — 抽出全部已注册工具的中文描述 → src/i18n/tools.zh-CN.json（机翻源表）。
 *
 *   npm run build && node scripts/i18n-extract-tools.mjs
 *
 * 用一个只收集不注册的假 server 跑一遍 registerGuideTools / registerProduceTools（与 test/ 里的做法同源），
 * 工具名 → 描述。instructions 写到 src/i18n/instructions.zh-CN.md。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'i18n')
mkdirSync(OUT, { recursive: true })

const { registerProduceTools } = await import('../dist/tools/produce.js')
const { registerGuideTools } = await import('../dist/tools/guide.js')
const { buildInstructions } = await import('../dist/tools/guide-data.js')

/** @type {Record<string, string>} */
const descs = {}
const fake = { tool: (name, desc) => { if (typeof desc === 'string') descs[name] = desc } }
const noClient = new Proxy({}, { get: () => async () => ({}) })
registerGuideTools(fake)
registerProduceTools(fake, noClient)

writeFileSync(join(OUT, 'tools.zh-CN.json'), JSON.stringify(descs, null, 2) + '\n')
writeFileSync(join(OUT, 'instructions.zh-CN.md'), buildInstructions() + '\n')
console.error(`抽出 ${Object.keys(descs).length} 个工具描述 → src/i18n/tools.zh-CN.json；instructions → src/i18n/instructions.zh-CN.md`)
