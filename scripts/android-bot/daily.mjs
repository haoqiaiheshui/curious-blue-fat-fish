// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 模拟器娱乐总调度：每天随机时段刷一个 App，结束后 QQ 汇报给主人
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureEmulator } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CFG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
const STATE = join(HERE, 'state.json')
const LOG = join(HERE, 'run.log')

export function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}

const readState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return {} } }
const saveState = (s) => { try { writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8') } catch {} }

async function notifyOwner(text) {
  try {
    await fetch('http://127.0.0.1:3000/send_private_msg', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CFG.onebotToken}` },
      body: JSON.stringify({ user_id: Number(CFG.ownerQQ), message: [{ type: 'text', data: { text } }] }),
      signal: AbortSignal.timeout(15000)
    })
  } catch (e) { log('通知失败: ' + e.message) }
}

function inSleepWindow() {
  const now = new Date()
  const [sh, sm] = (CFG.sleepWindow?.start || '00:30').split(':').map(Number)
  const [eh, em] = (CFG.sleepWindow?.end || '07:30').split(':').map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  const s = sh * 60 + sm, e = eh * 60 + em
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e)
}

const rand = (a, b) => a + Math.random() * (b - a)

async function runOnce() {
  const apps = CFG.apps || []
  const pick = apps[Math.floor(Math.random() * apps.length)]
  if (!pick) { log('没有可玩的 App'); return }
  log(`今天玩：${pick.name}（${pick.minutes} 分钟）`)
  try {
    const ready = await ensureEmulator()
    if (!ready) { log('模拟器没起来，跳过今天'); return }
    const mod = await import(`./${pick.module}`)
    const result = pick.run === 'browse' ? await mod.browse(pick.minutes, { like: true })
      : pick.run === 'listen' ? await mod.listen(pick.minutes)
      : null
    const summary = pick.run === 'browse'
      ? `在 B站看了 ${result?.seen?.length ?? 0} 个视频，点了 ${result?.liked ?? 0} 个赞`
      : `在网易云听了 ${result?.played?.length ?? 0} 段，红心了 ${result?.liked ?? 0} 首`
    log(summary)
    if (CFG.reportToOwner) await notifyOwner(`刚在模拟器里${summary}。`)
  } catch (e) {
    log(`玩 ${pick.name} 失败: ${e?.message ?? e}`)
  }
}

async function main() {
  log('=== 模拟器娱乐调度启动 ===')
  setInterval(async () => {
    if (inSleepWindow()) return
    const now = new Date()
    const day = now.toLocaleDateString('sv-SE')
    const st = readState()
    if (st.lastRunDay === day) return
    const [ah, am] = (CFG.runAt || '15:00').split(':').map(Number)
    const cur = now.getHours() * 60 + now.getMinutes()
    if (cur >= ah * 60 + am) {
      st.lastRunDay = day
      saveState(st)
      await runOnce()
    }
  }, 60 * 1000)
}

main().catch((e) => log('调度异常: ' + e.message))
