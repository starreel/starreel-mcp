import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WORKFLOW_HINT, registerProduceTools} from '../dist/tools/produce.js'
import {buildInstructions} from '../dist/tools/guide-data.js'

// 哨兵：review_videos 之后、compose_episode 之前的「成片前自检」引导。
// 2026-10-19 外部 agent 经 MCP 做完整片的复盘：全程没调 audit_seams / recommend_trim_window /
// scan_intra_shot_cuts / get_asset_versions / get_stale_portrait_frames，靠反复导出整片、手工试转场定位问题。
// 工具都在，缺的是「在哪一步用」——CLAUDE.md §9 最后一条（工具有了但描述没讲清）的又一个实例。
// 顺序：资产换过先确认版本 → 镜内跳切 → 逐镜裁剪窗口 → 相邻镜接缝 → 拼成片；拼完有问题回到这些工具定位，别整片反复导出。

/** 依次在 text 里找 patterns，每个必须出现在前一个命中之后；缺一个或顺序颠倒都 fail。 */
function assertOrdered(text,patterns,label){
 let from=0
 for(const p of patterns){
  const re=new RegExp(p.source,p.flags.replace('g','')+'g'); re.lastIndex=from
  const m=re.exec(text)
  assert.ok(m,`${label}：在位置 ${from} 之后找不到 ${p}（要么缺了，要么排到了前面）`)
  from=m.index+m[0].length
 }
}
function section(text,start,end,label){
 const s=text.search(start); assert.ok(s>=0,`${label}：找不到段首 ${start}`)
 const rest=text.slice(s); const e=rest.search(end); assert.ok(e>0,`${label}：找不到段尾 ${end}`)
 return rest.slice(0,e)
}

const ORDER=[/get_stale_portrait_frames/,/get_asset_versions/,/scan_intra_shot_cuts/,/recommend_trim_window/,/trim_shot/,/audit_seams/,/dry_run/,/compose_episode/]

function tools(){
 const m=new Map()
 registerProduceTools({tool:(name,desc)=>m.set(name,desc)},new Proxy({},{get:()=>async()=>({})}))
 return m
}

test('WORKFLOW_HINT：review_videos 之后有「成片前自检」段，按序挂上五个工具再 compose_episode',()=>{
 const seg=section(WORKFLOW_HINT,/⑤视频与配音层/,/★每一层审查之后你还要/,'WORKFLOW_HINT ⑤')
 assertOrdered(seg,[/review_videos/,/【成片前自检/,...ORDER],'WORKFLOW_HINT ⑤ 成片前自检')
 assert.match(seg,/整片/,'要点名「别反复导出整片定位问题」这个反模式')
 // audit_seams 执行按 token 计费：引导不许把它说成整步免费
 assert.match(seg,/audit_seams[^。]*dry_run[^。]*(计费|扣费)/,'audit_seams 执行要说明按 token 计费')
})

test('review_videos 工具描述：通过后、compose_episode 之前的自检顺序',()=>{
 const d=tools().get('review_videos')
 assertOrdered(d,[/compose_episode 之前必须审过/,/成片前自检/,...ORDER],'review_videos 描述')
})

test('compose_episode 工具描述：拼前自检 + 拼完定位问题回到这些工具、别整片反复导出',()=>{
 const d=tools().get('compose_episode')
 assertOrdered(d,[/成片前自检/,...ORDER.slice(0,-1)],'compose_episode 描述')
 assert.match(d,/整片/)
})

test('server instructions 主线：★review_videos → 成片前自检 → compose_episode（中文 / 英文）',()=>{
 const order=s=>section(s,/产线顺序|Pipeline order/,/get_pipeline_status/,'instructions 主线')
 const MAIN=[/review_videos/,/recommend_trim_window/,/audit_seams/,/compose_episode/]
 assertOrdered(order(buildInstructions()),MAIN,'buildInstructions')
 const zh=readFileSync(new URL('../src/i18n/instructions.zh-CN.md',import.meta.url),'utf8')
 assert.equal(zh.trim(),buildInstructions().trim(),'instructions.zh-CN.md 与 buildInstructions 不同步（跑 scripts/i18n-extract-tools.mjs）')
 const en=readFileSync(new URL('../src/i18n/instructions.en.md',import.meta.url),'utf8')
 assertOrdered(order(en),MAIN,'instructions.en.md')
})

test('i18n 表同步：tools.zh-CN.json 与注册描述一致，tools.en.json 也挂上这几个工具',()=>{
 const t=tools()
 const zh=JSON.parse(readFileSync(new URL('../src/i18n/tools.zh-CN.json',import.meta.url),'utf8'))
 const en=JSON.parse(readFileSync(new URL('../src/i18n/tools.en.json',import.meta.url),'utf8'))
 for(const name of ['review_videos','compose_episode']){
  assert.equal(zh[name],t.get(name),`tools.zh-CN.json 的 ${name} 未同步（跑 scripts/i18n-extract-tools.mjs）`)
  assertOrdered(en[name],ORDER.slice(0,-1),`tools.en.json ${name}`)
 }
})

test('SKILL.md 概览：[review_videos] → 成片前自检 → compose_episode',()=>{
 const SKILL=readFileSync(new URL('../SKILL.md',import.meta.url),'utf8')
 const ov=section(SKILL,/\[review_videos\]/,/→ compose_episode → final cut/,'SKILL 概览')
 assertOrdered(ov,[/get_stale_portrait_frames|get_asset_versions/,/scan_intra_shot_cuts/,/recommend_trim_window/,/audit_seams/],'SKILL 概览')
})
