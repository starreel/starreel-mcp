#!/usr/bin/env node
/**
 * WorkBuddy 连接器包构建(MCP + Skill 方案,规范见 open.workbuddy.cn/docs/connector)。
 *
 *   node workbuddy/build.mjs            # 校验 + 生成 workbuddy/package/starreel/ 与 workbuddy/dist/*.zip
 *   node workbuddy/build.mjs --check    # 只校验,不落盘
 *
 * SKILL.md 不在 src/ 里留副本:打包时从包根的 SKILL.md 拷进 skills/,与 npm 发布的那份同源。
 * mcp.json 用 @starreel/mcp@latest —— MCP 发新版不必重新提交连接器审核;
 * 只有 src/ 里的元信息 / 表单 / 图标变了才要重新打包上传(并递增 connector-meta.json 的 version)。
 */
import { readFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
const SKILL_SRC = join(HERE, '..', 'SKILL.md')

export function validate(src = SRC, skillSrc = SKILL_SRC) {
  const errors = []
  const readJson = (f) => {
    try {
      return JSON.parse(readFileSync(join(src, f), 'utf8'))
    } catch (e) {
      errors.push(`${f}: 读不出或不是合法 JSON (${e.message})`)
      return null
    }
  }
  const meta = readJson('connector-meta.json')
  const mcp = readJson('mcp.json')
  const schema = readJson('token-schema.json')
  if (!existsSync(join(src, 'icon.svg'))) errors.push('缺 icon.svg')
  if (!existsSync(skillSrc)) errors.push(`缺 SKILL.md(${skillSrc})`)

  if (meta) {
    for (const k of ['name', 'name_en', 'description', 'description_zh', 'description_en', 'source']) {
      if (!String(meta[k] || '').trim()) errors.push(`connector-meta.json 缺 ${k}`)
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.source || '')) errors.push('source 必须是 kebab-case')
    if (!/^\d+\.\d+\.\d+$/.test(meta.version || '')) errors.push('version 必须是语义化版本号')
    for (const k of ['examples_zh', 'examples_en']) {
      const n = Array.isArray(meta[k]) ? meta[k].length : 0
      if (n < 2 || n > 5) errors.push(`${k} 须 2~5 条(现 ${n})`)
    }
    // token 模式要 4.23.0,runtime/npmRegistries 要 5.0.0
    if (meta.auth_mode === 'token' && cmpVer(meta.minWorkbuddyVersion, '5.0.0') < 0) {
      errors.push('minWorkbuddyVersion 须 ≥ 5.0.0(用了 auth_mode=token 与 runtime)')
    }
  }

  let placeholders = []
  if (mcp) {
    const servers = Object.values(mcp.mcpServers || {})
    if (servers.length !== 1) errors.push(`mcp.json 只能配置一个 Server(现 ${servers.length})`)
    const s = servers[0] || {}
    if (s.type === 'stdio' && !s.command) errors.push('stdio 必须有 command')
    placeholders = [...JSON.stringify(s).matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1])
  }
  if (schema) {
    const fields = Array.isArray(schema.fields) ? schema.fields : []
    if (!fields.length) errors.push('token-schema.json 至少一个 field')
    const keys = fields.map((f) => f.key)
    for (const p of placeholders) if (!keys.includes(p)) errors.push(`mcp.json 的 \${${p}} 在 token-schema 里没有对应 key`)
    for (const k of keys) if (!placeholders.includes(k)) errors.push(`token-schema 的 ${k} 在 mcp.json 里没被引用`)
    for (const f of fields) {
      if (/KEY|TOKEN|SECRET/.test(f.key) && f.type !== 'password') errors.push(`${f.key} 是凭证,type 必须是 password`)
    }
  }

  // 任何文件里都不许出现真实凭证(占位 srk_live_... / srk_live_xxx 除外)
  for (const f of ['connector-meta.json', 'mcp.json', 'token-schema.json']) {
    let text = ''
    try { text = readFileSync(join(src, f), 'utf8') } catch { continue }
    if (/srk_(live|test)_[A-Za-z0-9]{8,}/.test(text)) errors.push(`${f} 疑似含真实 API Key`)
  }
  return { errors, meta }
}

function cmpVer(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

function build() {
  const { errors, meta } = validate()
  if (errors.length) {
    console.error('✗ 连接器包校验失败:\n  - ' + errors.join('\n  - '))
    process.exit(1)
  }
  console.log(`✓ 校验通过(source=${meta.source} version=${meta.version})`)
  if (process.argv.includes('--check')) return

  const pkgRoot = join(HERE, 'package')
  const top = join(pkgRoot, meta.source)
  rmSync(pkgRoot, { recursive: true, force: true })
  mkdirSync(join(top, 'skills', 'starreel-drama-production'), { recursive: true })
  for (const f of ['connector-meta.json', 'mcp.json', 'token-schema.json', 'icon.svg']) {
    cpSync(join(SRC, f), join(top, f))
  }
  cpSync(SKILL_SRC, join(top, 'skills', 'starreel-drama-production', 'SKILL.md'))

  const distDir = join(HERE, 'dist')
  mkdirSync(distDir, { recursive: true })
  const zip = join(distDir, `${meta.source}-workbuddy-${meta.version}.zip`)
  rmSync(zip, { force: true })
  // 单一顶层目录 starreel/,排除 macOS 元数据
  execFileSync('zip', ['-rqX', zip, meta.source, '-x', '*.DS_Store'], { cwd: pkgRoot })
  console.log(`✓ 已生成 ${zip}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build()
