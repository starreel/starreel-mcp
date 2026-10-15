import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {registerProduceTools, WORKFLOW_HINT} from '../dist/tools/produce.js'
import {MODEL_GUIDE, SEEDANCE25_PHOTOREAL_NOTE, buildInstructions} from '../dist/tools/guide-data.js'

// 2026-10-15：seedance-2.5 写实真人题材暂未开放（动漫/风格化可用）。引导文案必须把写实真人剧推荐到 hailuo-3，
// 不许再把 2.5 写成写实首选；对客只说「暂未开放」，不写商务原因。恢复时改 SEEDANCE25_PHOTOREAL_NOTE 引用处并同步本测试。
function descs(){
 const m=new Map()
 registerProduceTools({tool:(name,desc)=>m.set(name,desc)},new Proxy({},{get:()=>async()=>({})}))
 return m
}
const all=()=>[WORKFLOW_HINT,JSON.stringify(MODEL_GUIDE),buildInstructions(),...descs().values()].join('\n')

test('写实真人剧不再被引导到 seedance-2.5',()=>{
 const s=all()
 for (const bad of ['①写实真人剧→seedance-2.5','写实真人剧→seedance-2.5 或降本 hailuo-3','写实真人剧首选','是 → seedance-2.5(默认)'])
  assert.ok(!s.includes(bad),`残留旧引导：${bad}`)
 assert.match(WORKFLOW_HINT,/①写实真人剧→hailuo-3/)
 assert.ok(WORKFLOW_HINT.includes(SEEDANCE25_PHOTOREAL_NOTE))
})
test('模型指南：写实决策与标准配置指向 hailuo-3；2.5 仍是动漫/风格化可用',()=>{
 assert.match(MODEL_GUIDE.video_decision[0],/是 → hailuo-3/)
 assert.equal(MODEL_GUIDE.combos.find(c=>c.scenario.startsWith('写实真人短剧')).video_engine,'hailuo-3')
 const sd=MODEL_GUIDE.video_engines.find(e=>e.id==='seedance-2.5')
 assert.match(sd.best_for,/动漫\/风格化/)
 assert.equal(MODEL_GUIDE.video_engines.filter(e=>e.is_default).length,0,'视频引擎不许有全局默认标记(Codex P1)')
 assert.match(SEEDANCE25_PHOTOREAL_NOTE,/真人题材暂未开放/)
})
test('对客文案不提缴费/欠费/权益/配额（只查讲视频引擎的句子；别处的「后付不欠费」是计费说明）',()=>{
 const engineSentences=all().split(/[。;；\n]/).filter(x=>/seedance-2\.5|hailuo-3|真人题材/.test(x))
 assert.ok(engineSentences.length>5)
 for (const x of engineSentences) for (const w of ['缴费','欠费','补缴','权益','配额'])
  assert.ok(!x.includes(w),`对客文案出现商务原因「${w}」：${x.slice(0,80)}`)
})
test('机翻源表与源码描述同步（改描述后要重跑 i18n-extract-tools）',()=>{
 const zh=JSON.parse(readFileSync(new URL('../src/i18n/tools.zh-CN.json',import.meta.url),'utf8'))
 const d=descs()
 for (const [k,v] of d) if (v.includes(SEEDANCE25_PHOTOREAL_NOTE)) assert.equal(zh[k],v,k)
 const ins=readFileSync(new URL('../src/i18n/instructions.zh-CN.md',import.meta.url),'utf8')
 assert.equal(ins,buildInstructions()+'\n')
})
