import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ACTION_FILM} from '../dist/tools/guide-data.js'

// 2026-10-31：动作片指南只讲「首帧停在起势」，没讲段内尾帧停在哪——agent 写 last_frame_prompt
// 会写成收招 / 摆姿势，尾帧无法直接当下一镜首帧（chain_frames）。本哨兵钉住两头成对：
// 首帧起势仍在，段内尾帧 = 下一击起势；且新条目不写秒数时序句（会让模型先定格再硬切）。
const SKILL=readFileSync(new URL('../SKILL.md',import.meta.url),'utf8')
const SECONDS=/\d+(?:\.\d+)?\s*(?:秒|s\b)/

test('ACTION_FILM.shot_design：段内尾帧停在下一击起势，可直接接 chain_frames',()=>{
 const rule=ACTION_FILM.shot_design.find((s)=>s.includes('下一击'))
 assert.ok(rule,'shot_design 缺「尾帧停在下一击起势」条目')
 for (const must of ['尾帧','下一击','蓄力','重心前压','收招','chain_frames','最后一镜'])
  assert.ok(rule.includes(must),`尾帧条目缺「${must}」`)
 assert.ok(!SECONDS.test(rule),'尾帧条目不许写秒数时序句')
})

test('旧功能：首帧停在起势条目仍在',()=>{
 assert.ok(ACTION_FILM.shot_design.some((s)=>s.includes('首帧停在**起势**')))
})

test('SKILL.md 动作片段：同步尾帧 = 下一击起势',()=>{
 const sec=SKILL.slice(SKILL.indexOf('### Action / fight / skill-showcase films'))
 assert.ok(sec.includes('First frame = wind-up, not impact'))
 const i=sec.indexOf('Tail frame inside a fight run')
 assert.ok(i>0,'SKILL.md 缺尾帧条目')
 const bullet=sec.slice(i,sec.indexOf('\n- ',i))
 for (const must of ['next strike','chain_frames','last shot'])
  assert.ok(bullet.includes(must),`SKILL.md 尾帧条目缺「${must}」`)
 assert.ok(!SECONDS.test(bullet))
})
