import test from 'node:test'
import assert from 'node:assert/strict'

// 2026-10-13：本地化服务原域名的 DNS 曾悬空指向他人主机。loc() 会带着 Bearer token 发请求，
// 默认值指向一个我们不控制的主机 = 把客户的令牌送出去。所以不许有默认值：没配就拒，且一个请求都不发。
test('未配置 STARREEL_LOC_BASE 时 loc() 直接拒绝，且不发出任何网络请求', async () => {
  delete process.env.STARREEL_LOC_BASE
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('不应发出请求') }
  try {
    const { StarReelClient } = await import('../dist/client.js')
    const client = new StarReelClient('srk_test_dummy')
    await assert.rejects(client.loc('/api/series'), /STARREEL_LOC_BASE/)
    assert.deepEqual(calls, [])
  } finally {
    globalThis.fetch = realFetch
  }
})

test('源码里不再出现原本地化域名作为默认值', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\?\?\s*['"]https:\/\/translator\.starreel\.ai/)
})
