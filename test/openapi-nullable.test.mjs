// openapi.json 必须保留 zod 的 nullable：工具描述里写明「传 null 清空」的字段，spec 里不允许 null
// 就等于告诉按 spec 生成/校验的 REST 客户端「这个操作不存在」（#635 Codex review：生成器用连 nullable
// 一起剥的 unwrap 生成请求体属性，expression_hint / speed_factor 等 11 个字段全中）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'))
const putShot = spec.paths['/storyboards/{storyboard_id}'].put.requestBody.content['application/json'].schema.properties

const allowsNull = (s) => s?.type === 'null'
  || (Array.isArray(s?.type) && s.type.includes('null'))
  || (Array.isArray(s?.anyOf) && s.anyOf.some(allowsNull))

test('update_shot：文档写明「null 清空」的字段在 spec 里允许 null', () => {
  for (const k of ['expression_hint', 'speed_factor']) {
    assert.ok(putShot[k], `${k} 应在 update_shot 请求体里`)
    assert.ok(allowsNull(putShot[k]), `${k} 必须允许 null：${JSON.stringify(putShot[k])}`)
  }
})

test('非 nullable 字段不被顺手放宽成可 null', () => {
  for (const k of ['dialogue', 'image_prompt']) {
    assert.ok(putShot[k], `${k} 应在 update_shot 请求体里`)
    assert.ok(!allowsNull(putShot[k]), `${k} 不该允许 null：${JSON.stringify(putShot[k])}`)
  }
})

test('nullable 字段仍保留内层约束（如 maxLength），不是退化成任意值', () => {
  const str = putShot.expression_hint.anyOf?.find((s) => s.type === 'string') ?? putShot.expression_hint
  assert.equal(str.maxLength, 120)
})
