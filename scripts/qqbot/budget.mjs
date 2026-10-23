// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 每日额度守护：每天 10 元，超线自动收缩娱乐功能并通知
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CFG = JSON.parse(readFileSync(join(HERE, 'budget.json'), 'utf8').replace(/^\uFEFF/, ''))
const STATE = join(HERE, 'budget-state.json')
const LOG = join(HERE, 'budget.log')
const BRIDGE_TOKEN = readFileSync('C:\\path\\to\\derpyu-qq-bridge\\state\\console-token', 'utf8').trim()

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${m}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}
const readState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return null } }
const saveState = (s) => { try { writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8') } catch {} }
const today = () => new Date().toLocaleDateString('sv-SE')

async function totalCost() {
  try {
    const r = await fetch('http://127.0.0.1:3100/api/tokens/summary', {
      headers: { 'x-console-token': BRIDGE_TOKEN }, signal: AbortSignal.timeout(20000)
    })
    const j = await r.json()
    return j?.totals?.cost != null ? Number(j.totals.cost) : null
  } catch (e) { log('读用量失败: ' + e.message); return null }
}

async function notify(text) {
  try {
    await fetch('http://127.0.0.1:3000/send_private_msg', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CFG.accessToken}` },
      body: JSON.stringify({ user_id: Number(CFG.ownerQQ), message: [{ type: 'text', data: { text } }] }),
      signal: AbortSignal.timeout(15000)
    })
  } catch {}
}

function setMode(mode) {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'mode.ps1'), mode], { timeout: 180000, stdio: 'ignore' })
    log(`已切换模式：${mode}`)
    return true
  } catch (e) { log(`切模式失败(${mode}): ${e?.message ?? e}`); return false }
}

async function check() {
  const cur = await totalCost()
  if (cur === null) return
  const day = today()
  let st = readState()
  if (!st) st = { date: day, baseline: 0, notified: {} }
  if (st.date !== day) {
    st = { date: day, baseline: cur, notified: {} }
    log(`新的一天，重置基线为 ¥${cur.toFixed(2)}`)
  }
  const spent = Math.max(0, cur - st.baseline)
  st.cur = cur
  st.spent = spent
  const budget = Number(CFG.dailyBudget) || 10
  const pct = spent / budget

  log(`今日已花 ¥${spent.toFixed(2)} / 预算 ¥${budget}（${(pct * 100).toFixed(0)}%）`)

  // 阈值：warn 70%，stop 85%，hard 98%
  if (pct >= 0.7 && !st.notified.warn) {
    st.notified.warn = true
    log('⚠️ 已达 70% 预算')
    await notify(`今天额度用了 ¥${spent.toFixed(2)}（预算 ¥${budget}），到 85% 我会把娱乐功能停掉。`)
  }
  if (pct >= 0.85 && !st.notified.stop) {
    st.notified.stop = true
    log('⛔ 已达 85%，停娱乐功能')
    setMode('lite')
    await notify(`今天额度已用 ¥${spent.toFixed(2)} / ¥${budget}，我把抖音、分享、桌宠这些娱乐功能停了，只保留聊天。`)
  }
  if (pct >= 0.98 && !st.notified.hard) {
    st.notified.hard = true
    log('🚨 已用尽预算')
    setMode('lite')
    await notify(`今天的 ¥${budget} 额度基本用完了（¥${spent.toFixed(2)}）。我只保留最基本聊天，明天自动恢复。`)
  }
  saveState(st)
}

if (process.argv.includes('--status')) {
  const st = readState()
  const cur = await totalCost()
  const budget = Number(CFG.dailyBudget) || 10
  console.log(`今日已花：¥${(st?.spent ?? 0).toFixed(2)} / ¥${budget}`)
  console.log(`桥接累计：¥${(cur ?? 0).toFixed(2)}`)
  process.exit(0)
}

log(`=== 额度守护启动（每天 ¥${CFG.dailyBudget}）===`)
await check().catch((e) => log('检查异常：' + e.message))
setInterval(() => { check().catch((e) => log('检查异常：' + e.message)) }, 120000)
