import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProduceTools } from '../dist/tools/produce.js'
import { buildInstructions } from '../dist/tools/guide-data.js'
import { readFileSync } from 'node:fs'

// 2026-10-14：每一步完成后都要质检——平台两层新审查（review_assets / review_videos）+ 外部 agent 亲自质检（submit_qc_report）。
// MCP 侧不把参数透出去，agent 面对 400 无从自愈；描述不点名，agent 不会去调。三处一起钉：注册、参数与转发、描述引导。
function load(client = {}) {
  const tools = new Map()
  registerProduceTools({ tool: (name, desc, schema, handler) => tools.set(name, { desc, schema, handler }) }, client)
  return tools
}
function recorder() {
  const seen = []
  return { seen, client: { producePost: async (path, body) => { seen.push({ path, body }); return { ok: true } } } }
}

test('review_assets / review_videos / submit_qc_report 注册并打对路径', async () => {
  const { seen, client } = recorder()
  const t = load(client)
  await t.get('review_assets').handler({ episode_id: 9 })
  await t.get('review_videos').handler({ episode_id: 9 })
  await t.get('submit_qc_report').handler({ episode_id: 9, review_token: 'rv_x', verdict: 'pass', checklist: [{ id: 'a', result: 'ok' }], inspected: ['shot:1'] })
  assert.deepEqual(seen.map(x => x.path), ['/episodes/9/review/assets', '/episodes/9/review/videos', '/episodes/9/review/qc-report'])
  assert.equal(seen[2].body.review_token, 'rv_x')
  assert.deepEqual(seen[2].body.inspected, ['shot:1'])
  assert.equal('episode_id' in seen[2].body, false)
})

test('出镜头图两个工具接 asset_review_token 并原样转发；compose_episode 接 review_token / acknowledge_review', async () => {
  const { seen, client } = recorder()
  const t = load(client)
  for (const n of ['generate_frames', 'generate_shot_frame']) assert('asset_review_token' in t.get(n).schema, `${n} 缺 asset_review_token`)
  await t.get('generate_frames').handler({ episode_id: 9, quote_id: 'q', review_token: 'rv_s', asset_review_token: 'rv_a' })
  await t.get('generate_shot_frame').handler({ storyboard_id: 7, quote_id: 'q', review_token: 'rv_s', asset_review_token: 'rv_a' })
  await t.get('compose_episode').handler({ episode_id: 9, review_token: 'rv_v', acknowledge_review: true })
  assert.equal(seen[0].body.asset_review_token, 'rv_a')
  assert.equal(seen[1].body.asset_review_token, 'rv_a')
  assert.equal(seen[2].path, '/episodes/9/compose')
  assert.equal(seen[2].body.review_token, 'rv_v')
  assert.equal(seen[2].body.acknowledge_review, true)
  assert.match(t.get('compose_episode').desc, /review_videos/)
  assert.match(t.get('compose_episode').desc, /review_final_cut/)
})

test('五个审查工具都引导 agent 亲自质检并 submit_qc_report', () => {
  const t = load()
  for (const n of ['review_script', 'review_storyboards', 'review_assets', 'review_frames', 'review_videos']) {
    assert.match(t.get(n).desc, /submit_qc_report/, `${n} 没引导 agent 质检`)
    assert.match(t.get(n).desc, /agent_qc/)
  }
})

test('每个生成步骤的描述都点名完成后该调哪个质检', () => {
  const t = load()
  for (const n of ['generate_character_portraits', 'generate_portraits_and_sheets', 'generate_character_sheets', 'generate_character_sheet',
    'generate_prop_sheet', 'generate_scene_images', 'regenerate_scene_image']) assert.match(t.get(n).desc, /review_assets/, `${n} 缺资产层质检引导`)
  for (const n of ['generate_videos', 'regenerate_shot_video', 'generate_tts', 'generate_bgm']) assert.match(t.get(n).desc, /review_videos/, `${n} 缺视频层质检引导`)
  for (const n of ['generate_character_portraits', 'generate_prop_sheet', 'generate_videos']) assert.match(t.get(n).desc, /submit_qc_report/)
})

test('instructions / WORKFLOW_HINT / SKILL.md 讲的是五道闸 + agent 质检', () => {
  const ins = buildInstructions()
  assert.match(ins, /五道免费硬闸/)
  assert.match(ins, /review_assets/)
  assert.match(ins, /review_videos/)
  assert.match(ins, /submit_qc_report/)
  const src = readFileSync(new URL('../src/tools/produce.ts', import.meta.url), 'utf8')
  assert.match(src, /五道硬闸/)
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
  assert.match(skill, /Five hard gates/)
  assert.match(skill, /`review_assets`/)
  assert.match(skill, /submit_qc_report/)
})
