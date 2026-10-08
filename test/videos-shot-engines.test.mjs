import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

// 整集出视频按镜指定引擎：shot_engines 只能在报价时给（凭证钉死），generate_videos 不收。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
test('quote_videos 收 shot_engines 并原样转发；键必须是分镜 id、值必须在引擎白名单',async()=>{
 const {m,calls}=tools(); const t=m.get('quote_videos')
 assert.equal(t.schema.shot_engines.safeParse({'12':'hailuo-3'}).success,true)
 assert.equal(t.schema.shot_engines.safeParse({'12':'qa-other'}).success,false)
 assert.equal(t.schema.shot_engines.safeParse({'abc':'hailuo-3'}).success,false)
 await t.handler({episode_id:3,shot_engines:{'12':'wan3.0'}})
 assert.deepEqual(calls[0],{path:'/episodes/3/videos/quote',body:{shot_engines:{'12':'wan3.0'}}})
})
test('不传 ⇒ 不带该键（旧行为）；传了就原样带（空对象后端按未指定处理）',async()=>{
 const {m,calls}=tools()
 await m.get('quote_videos').handler({episode_id:3})
 await m.get('quote_videos').handler({episode_id:3,shot_engines:{}})
 assert.deepEqual(calls.map(c=>c.body),[{},{shot_engines:{}}])
})
test('openapi 请求体发布了 shot_engines（键为分镜 id、值为引擎枚举）',async()=>{
 const {readFileSync}=await import('node:fs')
 const o=JSON.parse(readFileSync(new URL('../openapi.json',import.meta.url),'utf8'))
 const sch=o.paths['/episodes/{episode_id}/videos/quote'].post.requestBody.content['application/json'].schema
 const se=sch.properties.shot_engines
 assert.ok(se,'shot_engines 缺失')
 assert.deepEqual(se.additionalProperties.enum,['seedance-2.5','hailuo-3','wan3.0','wan3.0-prime'])
})
test('generate_videos 不收 shot_engines；描述讲清含指定镜的场景组会拆成逐镜',()=>{
 const {m}=tools()
 assert.equal(m.get('generate_videos').schema.shot_engines,undefined)
 assert.match(m.get('quote_videos').desc,/拆成逐镜/)
})
