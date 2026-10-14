import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProduceTools } from '../dist/tools/produce.js'
import { readFileSync } from 'node:fs'

// 2026-10-14：单镜出帧 / 单镜重出视频也挂审查闸（后端 facade 对应路由已加 assertReviewed）。
// MCP 侧若不把 review_token / acknowledge_review 透传出去，agent 面对 400 无从自愈——
// 工具 schema 里没有这个参数，它只能换路径或放弃。三处同步：参数表、描述里的闸提示、转发体。
function load() {
  const tools = new Map()
  registerProduceTools({ tool: (name, desc, schema, handler) => tools.set(name, { desc, schema, handler }) }, {})
  return tools
}

for (const [name, reviewTool] of [['generate_shot_frame', 'review_storyboards'], ['regenerate_shot_video', 'review_frames']]) {
  test(`${name} 接 review_token / acknowledge_review，描述点名 ${reviewTool} 硬闸`, () => {
    const t = load().get(name)
    assert(t, `${name} 未注册`)
    assert('review_token' in t.schema, 'schema 缺 review_token')
    assert('acknowledge_review' in t.schema, 'schema 缺 acknowledge_review')
    assert.match(t.desc, new RegExp(reviewTool))
    assert.match(t.desc, /硬闸/)
  })
}

test('两个单镜工具把 review_token 原样转发给门面', async () => {
  const seen = []
  const client = {
    producePost: async (path, body) => { seen.push({ path, body }); return { ok: true } },
  }
  const tools = new Map()
  registerProduceTools({ tool: (name, desc, schema, handler) => tools.set(name, { desc, schema, handler }) }, client)
  await tools.get('generate_shot_frame').handler({ storyboard_id: 7, quote_id: 'q', frame_type: 'first_frame', review_token: 'rv_x', acknowledge_review: true })
  await tools.get('regenerate_shot_video').handler({ storyboard_id: 7, quote_id: 'q', review_token: 'rv_y' })
  assert.equal(seen[0].path, '/storyboards/7/frame/generate')
  assert.equal(seen[0].body.review_token, 'rv_x')
  assert.equal(seen[0].body.acknowledge_review, true)
  assert.equal(seen[1].path, '/storyboards/7/regen/generate')
  assert.equal(seen[1].body.review_token, 'rv_y')
})

test('WORKFLOW_HINT / 服务器 instructions / SKILL.md 不再把闸写成「只有批量工具」', () => {
  const produce = readFileSync(new URL('../src/tools/produce.ts', import.meta.url), 'utf8')
  const guide = readFileSync(new URL('../src/tools/guide-data.ts', import.meta.url), 'utf8')
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
  assert.match(produce, /generate_shot_frame[^\n]{0,80}同样/, 'WORKFLOW_HINT 要点名单镜出帧同受闸')
  assert.match(guide, /generate_shot_frame/, '服务器 instructions 要点名单镜路径')
  assert.match(skill, /`generate_shot_frame`[^\n]*\|[^\n]*review_storyboards|review_storyboards[^\n]*`generate_shot_frame`/, 'SKILL.md 硬闸表要列单镜出帧')
  assert.match(skill, /regenerate_shot_video/, 'SKILL.md 硬闸表要列单镜重出视频')
})
