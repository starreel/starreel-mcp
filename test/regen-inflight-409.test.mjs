import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'
import {readFileSync} from 'node:fs'

// #626：在途判据纳入首尾帧与请求参数后，409 的原因不止「提示词不同」。描述没讲到就会让 agent 误判
// （「我 prompt 没变怎么 409」→ 反复重发 / 去外部平台出片）。
test('regenerate_shot_video 的 409 原因覆盖换帧与请求参数',()=>{
 const tools=new Map()
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{})
 const d=tools.get('regenerate_shot_video').desc
 const why=d.slice(d.indexOf('`in_flight_generation_id`'),d.indexOf('reused_in_flight'))
 assert.match(why,/首帧/);assert.match(why,/尾帧/)
 assert.match(why,/参考素材|参考图/)
 assert.match(why,/没扣费/)
})
test('SKILL.md 的 409 说明同样覆盖换帧',()=>{
 const s=readFileSync(new URL('../SKILL.md',import.meta.url),'utf8')
 const i=s.indexOf('`in_flight_generation_id`** means')
 assert(i>0)
 assert.match(s.slice(i,i+600),/first\/last frame/)
})
