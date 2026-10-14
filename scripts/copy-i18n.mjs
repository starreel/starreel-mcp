#!/usr/bin/env node
// 把 src/i18n/*.json / *.md 拷进 dist/i18n：tsc 只搬 .ts，而 npm 包只发 dist（package.json files），
// 运行时 src/i18n.ts 的 loadEnDescriptions / instructionsFor 按 dist/i18n 找英文表。
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(ROOT, 'src', 'i18n')
const dst = join(ROOT, 'dist', 'i18n')
if (!existsSync(src)) process.exit(0)
mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.error('[copy-i18n] src/i18n → dist/i18n')
