import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

// VACE 视频重绘 / 换装重绘：七个工具打到门面的路径与参数；扣费上限、源片前置条件由门面凭证给，工具不收。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePost:async(path,body)=>{calls.push({m:'POST',path,body});return {ok:true}},
   produceGet:async(path)=>{calls.push({m:'GET',path});return {ok:true}}})
 return {m,calls}
}
test('七个工具都注册了',()=>{
 const {m}=tools()
 for(const n of ['get_repaint_capabilities','quote_repaint_shot_video','repaint_shot_video','quote_reskin_shot_video','reskin_shot_video','get_repaint_status','restore_repaint_original'])
  assert.ok(m.get(n),n)
})
test('路径与参数原样转发',async()=>{
 const {m,calls}=tools()
 await m.get('get_repaint_capabilities').handler({drama_id:3})
 await m.get('quote_repaint_shot_video').handler({storyboard_id:7})
 await m.get('repaint_shot_video').handler({storyboard_id:7,quote_id:'q_1',prompt:'p',control:'depth',strength:0,keep_scene:false})
 await m.get('quote_reskin_shot_video').handler({storyboard_id:7})
 await m.get('reskin_shot_video').handler({storyboard_id:7,quote_id:'q_2',first_frame_url:'https://x/f.png'})
 await m.get('get_repaint_status').handler({storyboard_id:7,generation_id:9})
 await m.get('restore_repaint_original').handler({storyboard_id:7,generation_id:9})
 assert.deepEqual(calls,[
  {m:'GET',path:'/dramas/3/vace-capabilities'},
  {m:'POST',path:'/storyboards/7/repaint/quote',body:undefined},
  {m:'POST',path:'/storyboards/7/repaint/generate',body:{quote_id:'q_1',prompt:'p',control:'depth',strength:0,keep_scene:false}},
  {m:'POST',path:'/storyboards/7/reskin/quote',body:undefined},
  {m:'POST',path:'/storyboards/7/reskin/generate',body:{quote_id:'q_2',first_frame_url:'https://x/f.png'}},
  {m:'GET',path:'/storyboards/7/vace/9'},
  {m:'POST',path:'/storyboards/7/vace-restore',body:{generation_id:9}},
 ])
})
test('参数约束：strength 只收 0/1；换装重绘只收 posebodyface/depth；不收扣费上限与源片地址',()=>{
 const {m}=tools()
 const rp=m.get('repaint_shot_video').schema, rs=m.get('reskin_shot_video').schema
 assert.equal(rp.strength.safeParse(1).success,true)
 assert.equal(rp.strength.safeParse(0.5).success,false)
 assert.equal(rs.control.safeParse('depth').success,true)
 assert.equal(rs.control.safeParse('scribble').success,false)
 for(const s of [rp,rs]){assert.equal(s.max_charge_points,undefined);assert.equal(s.expected_source_url,undefined)}
 assert.ok(rs.first_frame_url)
})
test('描述讲清关键用法：自有视频先 upload_shot_footage、接力、切回用 final_generation_id',()=>{
 const {m}=tools()
 assert.match(m.get('quote_repaint_shot_video').desc,/upload_shot_footage/)
 assert.match(m.get('quote_repaint_shot_video').desc,/接力/)
 assert.match(m.get('get_repaint_status').desc,/final_generation_id/)
 assert.match(m.get('reskin_shot_video').desc,/构图/)
})
