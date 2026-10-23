// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 模式调度：睡眠时段(默认 00:30-07:30)自动切精简，起床后自动切完整
// 用法：node mode-scheduler.mjs       常驻
//       node mode-scheduler.mjs --now  立刻按当前时间判断一次
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CFG = JSON.parse(readFileSync(join(HERE, 'scheduler.json'), 'utf8').replace(/^\uFEFF/, ''))
const LOG = join(HERE, 'scheduler.log')
const MODE_PS1 = join(HERE, 'mode.ps1')
const STATE = join(HERE, 'scheduler-state.json')

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${m}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}
const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return d } }

const today = () => new Date().toLocaleDateString('sv-SE')
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

function inSleepWindow() {
  const a = toMin(CFG.sleepStart), b = toMin(CFG.sleepEnd)
  if (a === null || b === null) return false
  const cur = nowMin()
  return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b)
}

function setMode(mode) {
  try {
    log(`执行模式切换：${mode}`)
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', MODE_PS1, mode], { timeout: 180000, stdio: 'ignore' })
    log(`模式切换完成：${mode}`)
    return true
  } catch (e) {
    log(`模式切换失败(${mode})：${e?.message ?? e}`)
    return false
  }
}

function check() {
  const st = readJSON(STATE, { lastSleepDay: '', lastWakeDay: '' })
  const day = today()
  const sleeping = inSleepWindow()
  const cur = nowMin()
  const a = toMin(CFG.sleepStart)
  const b = toMin(CFG.sleepEnd)

  // 1) 睡眠时段内 → 切精简（每天只切一次）
  if (sleeping) {
    if (st.lastSleepDay !== day) {
      log(`进入睡眠时段（${CFG.sleepStart}），切精简模式`)
      if (setMode('lite')) {
        st.lastSleepDay = day
        writeFileSync(STATE, JSON.stringify(st, null, 2), 'utf8')
      }
    }
    return
  }

  // 2) 非睡眠时段 → 只有【过了睡眠结束时间】才允许切完整，避免 00:00 刚过午夜就误触发
  const wakeEligible = (a <= b) ? (cur >= b) : (cur >= b && cur < a)
  if (!wakeEligible) return
  if (st.lastWakeDay === day) return
  log(`睡眠结束（${CFG.sleepEnd} 之后，现在 ${hhmm()}），切完整模式`)
  if (setMode('full')) {
    st.lastWakeDay = day
    writeFileSync(STATE, JSON.stringify(st, null, 2), 'utf8')
  }
}

if (process.argv.includes('--now')) {
  log('=== 立即按当前时间判断一次 ===')
  check()
  log('=== 判断完成 ===')
  process.exit(0)
}

log(`=== 调度器启动（睡眠 ${CFG.sleepStart}-${CFG.sleepEnd} 切精简，其余时间完整）===`)
check()
setInterval(check, 60000)
