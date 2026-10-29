import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {registerProduceTools, parseAspectNumber, WORKFLOW_HINT} from '../dist/tools/produce.js'
import {FREE_ASPECT_NOTE, PIPELINE} from '../dist/tools/guide-data.js'

// 自由宽高比(Seedance 2.5·按剧灰度):create_drama / update_project_settings 的 aspect_ratio
// = 固定档 ∪ 数值写法,宽÷高 [0.4,2.5];规范化与组合校验在后端(lib/free-aspect.ts),MCP 原样转发。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePut:async(path,body)=>{calls.push({path,body});return {ok:true}},
   producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
const FIXED=['9:16','16:9','1:1','4:5','4:3','21:9']
for (const name of ['create_drama','update_project_settings']) {
 test(`${name}:固定档照旧通过,数值写法通过`,()=>{
  const s=tools().m.get(name).schema.aspect_ratio
  for (const v of FIXED) assert.equal(s.safeParse(v).success,true,v)
  for (const v of [2.35,0.4,2.5,1,'2.35','2.35:1','47:20','0.5:1','2.35 : 1','1.85x1',undefined]) assert.equal(s.safeParse(v).success,true,String(v))
 })
 test(`${name}:越界 / 解析不出的拒`,()=>{
  const s=tools().m.get(name).schema.aspect_ratio
  for (const v of [0.39,2.51,0,-1,3,'3','2.6:1','1:3','abc','','16:0','2.35:1:1',null,true,Number.NaN]) assert.equal(s.safeParse(v).success,false,String(v))
 })
 test(`${name}:描述讲清自由比例的限制`,()=>{
  const d=tools().m.get(name).schema.aspect_ratio.description
  assert.ok(d.includes(FREE_ASPECT_NOTE))
  for (const w of ['Seedance 2.5','seedance-2.5','Seedream','4k','场景组','参考图','关键帧组','纯文生','400','0.4~2.5','2.35:1']) assert.ok(d.includes(w),w)
  assert.match(tools().m.get(name).desc,/自由宽高比/)
 })
}
test('建剧时的灰度口径:只有全量才能直接设,否则先固定档建剧再改',()=>{
 assert.match(FREE_ASPECT_NOTE,/建剧时只有全量开放才能直接设[^。]*先用固定档建剧[^。]*update_project_settings/)
})
test('update_project_settings 把数值原样转发到 PUT /dramas/:id(规范化归后端)',async()=>{
 const {m,calls}=tools(); const t=m.get('update_project_settings')
 await t.handler({drama_id:753,aspect_ratio:2.35})
 assert.deepEqual(calls[0],{path:'/dramas/753',body:{aspect_ratio:2.35}})
 await t.handler({drama_id:753,aspect_ratio:'47:20',confirm_aspect_change:true})
 assert.deepEqual(calls[1].body,{aspect_ratio:'47:20',confirm_aspect_change:true})
})
test('parseAspectNumber 与后端 classifyDramaAspectInput 同口径(分隔符 : x * × /)',()=>{
 assert.equal(parseAspectNumber('47:20'),2.35)
 assert.equal(parseAspectNumber('1.85×1'),1.85)
 assert.equal(parseAspectNumber('2.35/1'),2.35)
 assert.equal(parseAspectNumber('9:16'),9/16)
 assert.equal(parseAspectNumber('16:0'),null)
 assert.equal(parseAspectNumber('abc'),null)
})
test('引导文案同步:WORKFLOW_HINT / 建剧步 note / SKILL.md / 英文描述都讲到自由比例',()=>{
 assert.match(WORKFLOW_HINT,/自由宽高比/)
 assert.ok(PIPELINE[0].note.includes(FREE_ASPECT_NOTE))
 assert.match(readFileSync(new URL('../SKILL.md',import.meta.url),'utf8'),/Free aspect ratio \(Seedance 2\.5 only/)
 const en=JSON.parse(readFileSync(new URL('../src/i18n/tools.en.json',import.meta.url),'utf8'))
 assert.match(en.create_drama,/free aspect ratio/)
 assert.match(en.update_project_settings,/free aspect ratio[^]*Seedance 2\.5[^]*400/)
 const zh=JSON.parse(readFileSync(new URL('../src/i18n/tools.zh-CN.json',import.meta.url),'utf8'))
 for (const k of ['create_drama','update_project_settings']) assert.equal(zh[k],tools().m.get(k).desc,`zh ${k} 未重跑 i18n-extract-tools`)
})
