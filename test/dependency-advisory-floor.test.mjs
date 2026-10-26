import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 2026-10-26：公开镜像 starreel/starreel-mcp 报 Dependabot 告警，三个传递依赖已升到修补版。
// lockfile 随 npm 包与镜像一起分发，合并冲突选错边或重新生成 lockfile 都可能把它们打回含漏洞版本，这里钉住下限。
// zod（GHSA-mrhx-c7xc-m3w5）只在 4.6.6 修补，3.x 无补丁，已跨大版本升到 4；公开 spec 由 generate-openapi.ts 收敛回原形状。
const FLOORS = {
  'body-parser': '2.4.0', // GHSA-27r3-jxmh-p828
  'fast-uri': '3.1.9', // GHSA-w74x-v6f9-j3xg / -xhq7-xmqj-769h / -wjr9-j795-jxcr / -333x-w4r6-6crp
  'ip-address': '10.7.4', // GHSA-rxp7-6hxx-x8q5
  zod: '4.6.6', // GHSA-mrhx-c7xc-m3w5（直接依赖，同时被 @modelcontextprotocol/sdk 引用）
}

function cmp(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

test('lockfile 里已修补的传递依赖不低于修补版', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  for (const [name, floor] of Object.entries(FLOORS)) {
    const hits = Object.entries(lock.packages).filter(([k]) => k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`))
    assert.ok(hits.length > 0, `${name} 不在 lockfile 里——依赖树变了，请重新核对这条下限是否还需要`)
    for (const [k, v] of hits) assert.ok(cmp(v.version, floor) >= 0, `${k}@${v.version} 低于修补版 ${floor}`)
  }
})
