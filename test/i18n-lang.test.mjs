import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMcpLang, acceptLanguageFor, patchToolDescriptions, toolDescription, instructionsFor, describeCoverage, i18nStats } from '../dist/i18n.js'
import { readFileSync, existsSync } from 'node:fs'

test('en 模式启动日志报覆盖率：缺译文不许静默', () => {
  i18nStats.registered = 230; i18nStats.translated = 40
  assert.match(describeCoverage('en'), /40\/230/)
  assert.match(describeCoverage('en'), /⚠/)
  i18nStats.translated = 230
  assert.doesNotMatch(describeCoverage('en'), /⚠/)
  assert.equal(describeCoverage('zh-CN'), '')
  i18nStats.registered = 0; i18nStats.translated = 0
})

test('英文 server 引导已随包发出，且提到的工具名与中文版一致', () => {
  const en = new URL('../src/i18n/instructions.en.md', import.meta.url)
  assert.ok(existsSync(en), 'src/i18n/instructions.en.md 缺失')
  const enText = readFileSync(en, 'utf8')
  const zhText = readFileSync(new URL('../src/i18n/instructions.zh-CN.md', import.meta.url), 'utf8')
  const tools = s => new Set(s.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])
  const missing = [...tools(zhText)].filter(t => !tools(enText).has(t))
  assert.deepEqual(missing, [], `英文引导漏了工具名: ${missing.join(', ')}`)
  assert.equal(instructionsFor('中文引导', 'en'), enText.trim())
})

// 语言开关 STARREEL_MCP_LANG：zh-CN 默认；en 时工具描述按 tools.en.json 替换，没翻的回中文（永不空）。

test('resolveMcpLang：缺省 zh-CN；zh-* 归 zh-CN；其余归 en', () => {
  assert.equal(resolveMcpLang(undefined), 'zh-CN')
  assert.equal(resolveMcpLang(''), 'zh-CN')
  assert.equal(resolveMcpLang('zh-TW'), 'zh-CN')
  assert.equal(resolveMcpLang('en'), 'en')
  assert.equal(resolveMcpLang('EN-US'), 'en')
  assert.equal(resolveMcpLang('ja'), 'en')
})

test('acceptLanguageFor：按语言族给后端一个它一定认得的标签', () => {
  assert.equal(acceptLanguageFor('zh-CN'), 'zh-CN')
  assert.equal(acceptLanguageFor('en'), 'en-US')
})

test('zh-CN 不包 server.tool（逐字节旧行为）；en 包一层、没译文时仍是中文原文', () => {
  const calls = []
  const fake = { tool: (...args) => { calls.push(args); return 'registered' } }
  assert.equal(patchToolDescriptions(fake, 'zh-CN'), fake)
  const zhTool = fake.tool
  patchToolDescriptions(fake, 'en')
  assert.notEqual(fake.tool, zhTool)
  assert.equal(fake.tool('some_tool_without_translation', '中文描述', {}, async () => {}), 'registered')
  assert.equal(calls.at(-1)[1], '中文描述')
  // 非字符串第二参（极少见的重载）原样透传
  fake.tool('x', { title: 'cfg' })
  assert.deepEqual(calls.at(-1)[1], { title: 'cfg' })
})

test('toolDescription / instructionsFor：zh-CN 原样；en 缺译文回中文', () => {
  assert.equal(toolDescription('nope', '中文', 'zh-CN'), '中文')
  assert.equal(toolDescription('nope', '中文', 'en'), '中文')
  assert.equal(instructionsFor('中文引导', 'zh-CN'), '中文引导')
})
