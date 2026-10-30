import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ACTION_FILM, buildGuide} from '../dist/tools/guide-data.js'
import {registerProduceTools, WORKFLOW_HINT} from '../dist/tools/produce.js'

// 2026-10-31：动作片指南曾教「5~7 秒写一个主动作」，与后端节拍判据（action-pace.ts：约 1.3 秒一拍、
// 4 秒 2~3 拍、review_storyboards 报 action_beat_sparse）正好相反——外部 agent 照写就拆出慢动作镜。
// 本哨兵钉住：旧口径不许回来，pace 拍子规则必须在。数字与后端同源由后端
// test/action-pace-mcp-guide-sync.test.ts 比对，这里只管 MCP 包自己的文案面。
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8')
const SKILL=read('../SKILL.md')
const EN=read('../src/i18n/tools.en.json')
function descs(){
 const m=new Map()
 registerProduceTools({tool:(name,desc)=>m.set(name,desc)},new Proxy({},{get:()=>async()=>({})}))
 return m
}
const ZH_ALL=()=>[JSON.stringify(buildGuide()),WORKFLOW_HINT,...descs().values()].join('\n')

const OLD_ZH=/[5５]\s*[~～\-–—到至]\s*[7７]\s*秒[^。;；\n]{0,6}(?:写|只写|放)?\s*一个(?:主)?(?:动作|大招|招式)/
const OLD_EN=/one (?:big|main) move per\s*5\s*[–-]\s*7\s*s/i

test('动作片指南：不再出现「5~7 秒写一个主动作」旧口径',()=>{
 assert.ok(!OLD_ZH.test(ZH_ALL()),'中文引导里又出现了「5~7 秒一个主动作」')
 assert.ok(!OLD_ZH.test(JSON.stringify(ACTION_FILM)))
 assert.ok(!OLD_EN.test(SKILL),'SKILL.md 又出现了 one big move per 5–7 s shot')
 assert.ok(!OLD_EN.test(EN))
})

test('动作片指南 shot_design：带 pace 拍子规则、稀疏码与大位移例外',()=>{
 const t=ACTION_FILM.shot_design.join('\n')
 for (const must of ['约 1.3 秒一拍','4 秒写 2~3 拍','BEAT 1','BEAT 2','BEAT 3','action_beat_sparse','pace','fast','frenzy','normal','slow / pause','大位移'])
  assert.ok(t.includes(must),`shot_design 缺「${must}」`)
})

test('SKILL.md 动作片段：同一套拍子规则',()=>{
 const sec=SKILL.slice(SKILL.indexOf('### Action / fight / skill-showcase films'))
 for (const must of ['1.3 s per beat','2–3','action_beat_sparse','pace','Large-displacement'])
  assert.ok(sec.includes(must),`SKILL.md 动作片段缺「${must}」`)
})

test('「每镜 5-7 秒正常」的两处说明都注明动作镜例外',()=>{
 assert.match(WORKFLOW_HINT,/5-7 秒是对 AI 出视频优化的正常时长\*\*\(动作镜例外/)
 assert.match(descs().get('generate_storyboards'),/\(动作镜按节拍约 4 秒写 2~3 拍/)
})
