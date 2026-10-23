// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 睡前晚安 / 起床早安：到点按人设现写一句，发到指定会话
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CFG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
const STATE = join(HERE, 'state.json')
const LOG = join(HERE, 'greet.log')

function log(m) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${m}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}
const readState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return {} } }
const writeState = (s) => { try { writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8') } catch {} }
const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }

async function makeLine(kind) {
  const sys = (CFG.persona || '你叫蓝色大肥鱼，是群里的一条鱼，说话短、有点欠、不客套。') +
    `\n\n任务：写一句${kind === 'goodnight' ? '晚安' : '早安'}。要求：10~25 字，像真人随口说的，` +
    '可以带点它自己的味道（鱼、潜水、泡水之类），不要煽情、不要"今天也要加油哦"这种话、不要表情符号、不要引号。'
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CFG.apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 80,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: kind === 'goodnight' ? '写晚安' : '写早安' }]
      }),
      signal: AbortSignal.timeout(45000)
    })
    const j = await res.json()
    const t = String(j?.choices?.[0]?.message?.content || '').trim().replace(/^["'“”「」]+|["'“”「」]+$/g, '').replace(/\n+/g, ' ')
    if (t) return t.slice(0, 60)
  } catch (e) { log('生成失败，用备用句：' + e.message) }
  return kind === 'goodnight' ? '沉底了，有事明天再说。' : '醒了，我先冒个头。'
}

async function send(target, text) {
  const action = target.type === 'group' ? 'send_group_msg' : 'send_private_msg'
  const params = target.type === 'group'
    ? { group_id: Number(target.id), message: [{ type: 'text', data: { text } }] }
    : { user_id: Number(target.id), message: [{ type: 'text', data: { text } }] }
  const r = await fetch(`${CFG.httpUrl}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CFG.accessToken}` },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15000)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.retcode !== 0) throw new Error(`${action} 失败: ${j.wording || j.retcode || r.status}`)
}

const JOBS = [
  { kind: 'goodnight', key: 'lastGoodnight', field: 'goodnightAt', label: '晚安' },
  { kind: 'goodmorning', key: 'lastGoodmorning', field: 'goodmorningAt', label: '早安' }
]

async function tick() {
  const st = readState()
  const now = hhmm()
  const day = today()
  for (const job of JOBS) {
    if (CFG[job.field] !== now) continue
    if (st[job.key] === day) continue
    const text = await makeLine(job.kind)
    let okCount = 0
    for (const target of (CFG.targets || [])) {
      try { await send(target, text); okCount++ } catch (e) { log(`${target.type}:${target.id} 发送失败：${e.message}`) }
    }
    st[job.key] = day
    writeState(st)
    log(`✅ ${job.label}已发（${okCount}/${(CFG.targets || []).length}）：${text}`)
  }
}

async function main() {
  log(`=== 晚安/早安 守护启动（晚安 ${CFG.goodnightAt}，早安 ${CFG.goodmorningAt}）===`)
  await tick().catch((e) => log('tick 异常：' + e.message))
  setInterval(() => { tick().catch((e) => log('tick 异常：' + e.message)) }, 30000)
}
main()
