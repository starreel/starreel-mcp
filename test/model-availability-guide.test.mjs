import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {registerProduceTools, WORKFLOW_HINT} from '../dist/tools/produce.js'
import {MODEL_GUIDE, MODEL_AVAILABILITY_NOTE, buildInstructions} from '../dist/tools/guide-data.js'

// 2026-10-16：模型×题材可用性的唯一控制点是管理控制台「AI 服务商」卡片的题材开关，get_production_menu 实时反映。
// 10-15 曾在引导文案里写死「seedance-2.5 真人题材暂未开放」——控制台开放后还得另发一版 MCP 才能改口。
// 本哨兵钉住：MCP 文案不许预设哪个模型不可用，只许让 agent 以菜单 availability 为准并转告 customer_note / expected_until。
function descs(){
 const m=new Map()
 registerProduceTools({tool:(name,desc)=>m.set(name,desc)},new Proxy({},{get:()=>async()=>({})}))
 return m
}
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8')
const EN=JSON.parse(read('../src/i18n/tools.en.json'))
const ZH=JSON.parse(read('../src/i18n/tools.zh-CN.json'))
const SKILL=read('../SKILL.md')
const all=()=>[WORKFLOW_HINT,JSON.stringify(MODEL_GUIDE),buildInstructions(),...descs().values()].join('\n')

// 「某引擎 + 不可用结论」的写死句式（中英）。通用的「同一引擎可能…暂不可用」是举例，不含引擎名，不会命中。
// 「…不可用时用 X」是条件句（描述后端按实时可用性分流），不是结论，用 (?!时) 放过。
const ZH_HARD=/(seedance|hailuo|wan3|2\.5|H3)[^。;；\n]{0,24}(暂未开放|未开放|暂不开放|暂不支持写实|不可用)(?!时)/i
// 引擎名里带点(seedance-2.5)，所以这里不能拿「.」当句界
const EN_HARD=/(seedance|hailuo|wan3)[^;\n]{0,80}?(not (yet )?open|not available[^;\n]{0,40}?for now|does not take realistic)/i

test('中文文案：不写死任何引擎的题材可用性结论',()=>{
 for (const line of all().split(/[。;；\n]/)) assert.ok(!ZH_HARD.test(line),`写死的可用性结论：${line.slice(0,120)}`)
})
test('英文工具描述与 SKILL.md：不写死任何引擎的题材可用性结论',()=>{
 for (const [k,v] of Object.entries(EN)) assert.ok(!EN_HARD.test(v),`tools.en.json ${k}: ${(v.match(EN_HARD)||[''])[0]}`)
 assert.ok(!EN_HARD.test(SKILL.replace(/\n\s*/g,' ')),`SKILL.md: ${(SKILL.replace(/\n\s*/g,' ').match(EN_HARD)||[''])[0]}`)
})
test('统一口径：以 get_production_menu 的 availability 为准，转告 customer_note / expected_until',()=>{
 for (const w of ['get_production_menu','availability','customer_note','expected_until']) assert.ok(MODEL_AVAILABILITY_NOTE.includes(w),w)
 assert.ok(WORKFLOW_HINT.includes(MODEL_AVAILABILITY_NOTE))
 assert.ok(MODEL_GUIDE.video_decision[0].includes(MODEL_AVAILABILITY_NOTE))
 const menu=descs().get('get_production_menu')
 assert.match(menu,/customer_note 与 expected_until/)
 for (const k of ['set_script','rewrite_script','extract_assets']) assert.match(EN[k],/get_production_menu[^]*customer_note[^]*expected_until/,`en ${k}`)
 assert.match(EN.get_production_menu,/customer_note[^]*expected_until/)
 assert.match(SKILL,/customer_note[^]*expected_until/)
})
test('写实真人剧：两个候选都列出，由菜单当前可用性决定，不预设默认结论',()=>{
 assert.match(WORKFLOW_HINT,/①写实真人剧→seedance-2\.5[^;]*hailuo-3/)
 assert.match(MODEL_GUIDE.video_decision[0],/seedance-2\.5 或降本 hailuo-3/)
 assert.equal(MODEL_GUIDE.video_engines.filter(e=>e.is_default).length,0,'视频引擎不许有全局默认标记(Codex P1)')
})
test('不传 video_engine 不保证落在菜单可用引擎上：要求显式传，不许宣称「不传会按实时可用性自动选」(PR#1060 Codex P2)',()=>{
 // 建剧路由 newDramaVideoEngineStamp 只看画风 + 2.5 写实开关/卡片停用，不查菜单的题材可用性
 assert.match(WORKFLOW_HINT,/显式传 video_engine/)
 for (const k of ['set_script','rewrite_script','extract_assets']) assert.match(EN[k],/pass video_engine explicitly/,`en ${k}`)
 assert.match(SKILL,/pass the menu-selected\s+`video_engine` explicitly/)
 const s=all()+JSON.stringify(EN)+SKILL
 for (const bad of ['按画风与实时可用性自动选','picks by style and live availability','auto-selects by style and live availability'])
  assert.ok(!s.includes(bad),`残留：${bad}`)
})
test('对客文案不提缴费/欠费/权益/配额（只查讲视频引擎的句子；别处的「后付不欠费」是计费说明）',()=>{
 const engineSentences=all().split(/[。;；\n]/).filter(x=>/seedance-2\.5|hailuo-3|真人题材/.test(x))
 assert.ok(engineSentences.length>5)
 for (const x of engineSentences) for (const w of ['缴费','欠费','补缴','权益','配额'])
  assert.ok(!x.includes(w),`对客文案出现商务原因「${w}」：${x.slice(0,80)}`)
})
test('机翻源表与源码描述同步（改描述后要重跑 i18n-extract-tools）',()=>{
 const d=descs()
 for (const [k,v] of d) if (v.includes(MODEL_AVAILABILITY_NOTE) || k==='get_production_menu') assert.equal(ZH[k],v,k)
 assert.equal(read('../src/i18n/instructions.zh-CN.md'),buildInstructions()+'\n')
})
