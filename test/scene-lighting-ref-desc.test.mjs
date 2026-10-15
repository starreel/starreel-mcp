import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {registerProduceTools} from '../dist/tools/produce.js'

// 打光参考图已改为无身份光照探针（两只哑光标定球），按剧灰度。工具描述必须两种情况都说对：
// 不能只说「中性人脸特写」（误导 agent 以为平台会给近景镜送一张陌生人脸），也不能只说探针（阀未开的剧仍是旧人像）。
function descs(){
 const m=new Map()
 registerProduceTools({tool:(name,desc)=>m.set(name,desc)},new Proxy({},{get:()=>async()=>({})}))
 return m
}
test('quote_scene_lighting_ref 描述同时讲清探针与旧人像，并指向报价 note',()=>{
 const d=descs().get('quote_scene_lighting_ref')
 assert.match(d,/无身份光照探针/)
 assert.match(d,/标定球/)
 assert.match(d,/中性人脸特写/)
 assert.match(d,/note/)
 assert.doesNotMatch(d,/打光参考图=只复现该场景光线的中性人脸特写/)
})
test('机翻源表与源码描述同步（改描述后要重跑 i18n-extract-tools）',()=>{
 const zh=JSON.parse(readFileSync(new URL('../src/i18n/tools.zh-CN.json',import.meta.url),'utf8'))
 assert.equal(zh.quote_scene_lighting_ref,descs().get('quote_scene_lighting_ref'))
})
