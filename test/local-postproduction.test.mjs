import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProduceTools } from '../dist/tools/produce.js'
function setup(response, failure) {
 const calls=[]; const registry=new Map()
 const client={produceGet:async path=>{calls.push(path);if(failure)throw failure;return structuredClone(response)},producePost:()=>{throw Error('write forbidden')}}
 registerProduceTools({tool:(name,desc,schema,handler)=>registry.set(name,{schema,handler})},client)
 return {calls,run:async args=>JSON.parse((await registry.get('export_handoff_pack').handler(args)).content[0].text)}
}
const base={manifest_version:'0.1',episode_id:1,shots:[{shot_number:1,clip:{url:'https://example.test/source.mp4'},voice_track:{location:'baked_in_clip'}}],render_target:{color_lut:{key:'test',haldclut_url:'https://example.test/lut.png'}}}
test('external color handoff disables automatic LUT without losing audio or source',async()=>{
 const {run,calls}=setup(base);const r=await run({episode_id:1,purpose:'local_color',color_goal:'[用户色彩目标]'})
 assert.equal(r.render_target.color_lut,null);assert.deepEqual(r.shots,base.shots)
 assert.deepEqual(r.postproduction.platform_lut,base.render_target.color_lut)
 assert.equal(r.postproduction.goal,'[用户色彩目标]');assert.equal(r.postproduction.status,'not_processed')
 assert.deepEqual(calls,['/episodes/1/handoff-pack']);assert.ok(base.render_target.color_lut)
})
test('legacy assembly keeps its LUT and voice guidance',async()=>{
 const {run}=setup(base);const r=await run({episode_id:1})
 assert.deepEqual(r.render_target,base.render_target);assert.ok(r.assembly_guide.step_1b_verify_voice);assert.equal(r.postproduction,undefined)
})
test('image-only episode exports existing frames without video requests',async()=>{
 const {run,calls}=setup([{id:2,storyboard_number:1,first_frame_image:'https://example.test/a.png',last_frame_image:'https://example.test/a.png',last_frame_source:'first-copy'},{id:3,storyboard_number:2,first_frame_image:null}])
 const r=await run({episode_id:1,media_type:'images',purpose:'local_color'})
 assert.deepEqual(calls,['/episodes/1/storyboards']);assert.equal(r.shots.length,1)
 assert.equal(r.shots[0].images.length,1);assert.deepEqual(r.postproduction.missing_shots,[2]);assert.equal(r.render_target.color_lut,null)
 assert.equal(r.shots[0].images[0].prior_grade,'unknown')
})
test('missing images fail without generating assets',async()=>{
 const {run}=setup([{id:2,storyboard_number:1}]);await assert.rejects(run({episode_id:1,media_type:'images'}),/没有可导出/)
})
test('ownership denial propagates without fallback',async()=>{
 const {run,calls}=setup(null,Error('403'));await assert.rejects(run({episode_id:1,media_type:'images'}),/403/);assert.equal(calls.length,1)
})
