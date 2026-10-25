// WorkBuddy 连接器包:现行 src/ 必须过校验;校验器对典型错误必须变红(哨兵)。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from '../workbuddy/build.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'workbuddy', 'src')
const SKILL = join(ROOT, 'SKILL.md')

function mutated(file, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-conn-'))
  cpSync(SRC, dir, { recursive: true })
  const p = join(dir, file)
  writeFileSync(p, JSON.stringify(fn(JSON.parse(readFileSync(p, 'utf8'))), null, 2))
  return dir
}

test('现行连接器包通过校验', () => {
  assert.deepEqual(validate(SRC, SKILL).errors, [])
})

test('mcp.json 引用了表单里没有的变量 → 红', () => {
  const dir = mutated('mcp.json', (j) => {
    j.mcpServers.starreel.env.OTHER = '${OTHER_VAR}'
    return j
  })
  assert.ok(validate(dir, SKILL).errors.some((e) => e.includes('OTHER_VAR')))
})

test('API Key 字段不是 password → 红', () => {
  const dir = mutated('token-schema.json', (j) => {
    j.fields[0].type = 'text'
    return j
  })
  assert.ok(validate(dir, SKILL).errors.some((e) => e.includes('password')))
})

test('写进真实形态的密钥 → 红', () => {
  const dir = mutated('mcp.json', (j) => {
    j.mcpServers.starreel.env.STARREEL_API_KEY = 'srk_live_' + 'a1b2c3d4e5f6'
    return j
  })
  assert.ok(validate(dir, SKILL).errors.some((e) => e.includes('真实 API Key')))
})

test('配置两个 Server / 示例不足 2 条 → 红', () => {
  const two = mutated('mcp.json', (j) => {
    j.mcpServers.extra = { ...j.mcpServers.starreel }
    return j
  })
  assert.ok(validate(two, SKILL).errors.some((e) => e.includes('一个 Server')))
  const few = mutated('connector-meta.json', (j) => {
    j.examples_zh = ['只有一条']
    return j
  })
  assert.ok(validate(few, SKILL).errors.some((e) => e.includes('examples_zh')))
})
