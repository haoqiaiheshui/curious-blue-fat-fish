// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// QQ 掉线守护：每 5 分钟探活一次，掉线自动重启 NapCat（密码登录），恢复后通知主人
import { appendFileSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CFG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
const LOG = join(HERE, 'watch.log')

function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}

/** 问 OneBot 要登录信息；失败说明掉线 */
async function loginInfo() {
  try {
    const res = await fetch(`${CFG.httpUrl}/get_login_info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CFG.accessToken}` },
      body: '{}',
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    const j = await res.json()
    if (j?.retcode !== 0 || !j?.data?.user_id) return null
    return j.data
  } catch { return null }
}

async function portOpen(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
    return res !== null || true // 连上就说明端口开了（响应码无所谓）
  } catch { return false }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore', ...opts })
    p.on('exit', (code) => resolve(code))
    p.on('error', () => resolve(-1))
  })
}

/** 杀掉 NapCat 相关进程 */
async function killNapCat() {
  await run('taskkill', ['/F', '/IM', 'NapCatWinBootMain.exe'])
  await run('powershell', ['-NoProfile', '-Command',
    "Get-Process -Name QQ -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*NapCat.52230.Shell*' } | Stop-Process -Force"])
}

/** 启动 NapCat（密码快速登录） */
async function startNapCat() {
  const env = {
    ...process.env,
    ACCOUNT: String(CFG.account),
    NAPCAT_QUICK_PASSWORD: CFG.password
  }
  const child = spawn(CFG.napcatExe, [String(CFG.account)], {
    cwd: CFG.napcatDir, env, detached: true, stdio: 'ignore'
  })
  child.unref()
}

/** 等 3001 起来（最多 waitMs） */
async function waitOnline(waitMs = 180000) {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000))
    try { writeFileSync(join(HERE, 'heartbeat.txt'), String(Date.now()), 'utf8') } catch {}
  const info = await loginInfo()
    if (info) return info
  }
  return null
}

/** 通知主人（需要 QQ 在线） */
async function notifyOwner(text) {
  try {
    await fetch(`${CFG.httpUrl}/send_private_msg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CFG.accessToken}` },
      body: JSON.stringify({ user_id: Number(CFG.ownerQQ), message: [{ type: 'text', data: { text } }] }),
      signal: AbortSignal.timeout(10000)
    })
  } catch {}
}


/** 用「扫码模式」重启 NapCat（不传密码，逼它走二维码） */
async function startNapCatQR() {
  try {
    const env = { ...process.env }
    delete env.NAPCAT_QUICK_PASSWORD
    delete env.NAPCAT_QUICK_PASSWORD_MD5
    env.ACCOUNT = String(CFG.account)
    const child = spawn(CFG.napcatExe, [], { cwd: CFG.napcatDir, env, detached: true, stdio: 'ignore' })
    child.unref()
  } catch (e) { log('扫码模式启动失败: ' + (e?.message ?? e)) }
}

/** 等二维码文件出现，放大并自动打开给你看 */
/** 把二维码图片推送到手机（ntfy.sh） */
async function pushQrToPhone(pngPath) {
  if (!CFG.ntfyPush || !CFG.ntfyTopic) return false
  try {
    const buf = readFileSync(pngPath)
    const base = 'https://ntfy.sh/' + CFG.ntfyTopic
    // 先发文字提醒
    await fetch(base, {
      method: 'POST',
      headers: { Title: encodeURIComponent('QQ 需要扫码登录'), Priority: 'urgent', Tags: 'rotating_light,warning' },
      body: '机器人掉线了，需要用手机 QQ 扫码。二维码图片在下一条消息里。',
      signal: AbortSignal.timeout(20000)
    }).catch(() => {})
    // 再发二维码图片附件
    const r = await fetch(base, {
      method: 'PUT',
      headers: {
        Filename: 'qq-qr.png',
        Title: encodeURIComponent('QQ 登录二维码（约2分钟有效）'),
        Message: encodeURIComponent('打开手机 QQ → 扫一扫 → 右上角相册 → 选这张图'),
        Priority: 'urgent',
        Tags: 'qrcode'
      },
      body: buf,
      signal: AbortSignal.timeout(30000)
    })
    log('📱 二维码已推送到手机 ntfy（HTTP ' + r.status + '）')
    return r.ok
  } catch (e) {
    log('手机推送失败: ' + (e?.message ?? e))
    return false
  }
}

async function showQRCode(timeoutMs = 90000) {
  const src = path.join(CFG.napcatDir, 'versions', '9.9.33-52230', 'resources', 'app', 'napcat', 'cache', 'qrcode.png')
  const out = 'C:\\path\\to\\qqbot-root\\napcat-qr-big.png'
  const deadline = Date.now() + timeoutMs
  let lastMtime = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      if (!existsSync(src)) continue
      const st = statSync(src)
      if (st.mtimeMs <= lastMtime) continue
      lastMtime = st.mtimeMs
      const ps = [
        'Add-Type -AssemblyName System.Drawing',
        `$src='${src}'`,
        `$dst='${out}'`,
        '$im=[System.Drawing.Image]::FromFile($src)',
        '$bmp=New-Object System.Drawing.Bitmap(600,600)',
        '$g=[System.Drawing.Graphics]::FromImage($bmp)',
        '$g.Clear([System.Drawing.Color]::White)',
        '$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor',
        '$g.DrawImage($im,40,40,520,520)',
        '$g.Dispose()',
        '$bmp.Save($dst,[System.Drawing.Imaging.ImageFormat]::Png)',
        '$bmp.Dispose()',
        '$im.Dispose()'
      ].join('; ')
      execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "' + ps + '"', { timeout: 60000 })
      log('二维码已放大：' + out)
      await pushQrToPhone(out)
      spawn('cmd.exe', ['/c', 'start', '', out], { detached: true, stdio: 'ignore' }).unref()
      return true
    } catch (e) { log('二维码处理失败: ' + (e?.message ?? e)) }
  }
  return false
}


// ── 登录尝试退避：防止频繁重登触发腾讯风控 ──────────────
const ATTEMPT_FILE = join(HERE, 'login-attempts.json')
function readAttempts() {
  try { return JSON.parse(readFileSync(ATTEMPT_FILE, 'utf8')) } catch { return { list: [] } }
}
function saveAttempts(a) { try { writeFileSync(ATTEMPT_FILE, JSON.stringify(a, null, 2), 'utf8') } catch {} }
function recordAttempt() {
  const a = readAttempts()
  a.list = [...(a.list || []), Date.now()].slice(-20)
  saveAttempts(a)
  return a.list
}
/** 允许登录吗：每小时最多 2 次，每天最多 6 次 */
function canAttempt() {
  const a = readAttempts()
  const now = Date.now()
  const hour = (a.list || []).filter((t) => now - t < 3600 * 1000)
  const day = (a.list || []).filter((t) => now - t < 24 * 3600 * 1000)
  if (hour.length >= 2) return { ok: false, why: `本小时已尝试 ${hour.length} 次登录` }
  if (day.length >= 6) return { ok: false, why: `今天已尝试 ${day.length} 次登录` }
  return { ok: true }
}
/** 距下次允许登录还要等多久 */
function nextAllowedIn() {
  const a = readAttempts()
  const now = Date.now()
  const hour = (a.list || []).filter((t) => now - t < 3600 * 1000).sort()
  if (hour.length >= 2) return Math.max(0, 3600 * 1000 - (now - hour[hour.length - 2]))
  const day = (a.list || []).filter((t) => now - t < 24 * 3600 * 1000).sort()
  if (day.length >= 6) return Math.max(0, 24 * 3600 * 1000 - (now - day[day.length - 6]))
  return 0
}

/** 外网通不通（用来区分「QQ掉线」和「自己断网」） */
async function networkOk() {
  try {
    const r = await fetch('https://ntfy.sh/', { method: 'HEAD', signal: AbortSignal.timeout(6000) })
    return r.status > 0
  } catch { return false }
}

async function checkOnce() {
  const info = await loginInfo()
  if (info) {
    if (!globalThis.__firstOkLogged) {
      globalThis.__firstOkLogged = true
      log(`在线正常：${info.user_id} ${info.nickname}（之后每 ${CFG.intervalMinutes} 分钟静默检查一次）`)
    }
    if (globalThis.__wasDown) {
      log(`✅ 已恢复在线：${info.user_id} ${info.nickname}`)
      await notifyOwner(`掉线后已自动恢复上线（${info.nickname}）。`)
      globalThis.__wasDown = false
    }
    return true
  }
  // 掉线
  globalThis.__wasDown = true
  // 先判断是不是自己断网：断网时不要重启 NapCat / 不要生成二维码
  const netOk = await networkOk()
  if (!netOk) {
    log('🌐 检测到本机断网（不是 QQ 掉线），等网络恢复再处理，不做登录尝试')
    return false
  }
  const gate = canAttempt()
  if (!gate.ok) {
    const waitMin = Math.ceil(nextAllowedIn() / 60000)
    log(`⏸️ 暂不重登（${gate.why}，约 ${waitMin} 分钟后再试）——避免频繁登录触发风控`)
    return false
  }
  recordAttempt()
  log(`❌ 检测到掉线，开始自动恢复（本次为今日第 ${readAttempts().list.filter((t) => Date.now() - t < 86400000).length} 次尝试）…`)
  await killNapCat()
  await new Promise((r) => setTimeout(r, 4000))
  await startNapCat()
  const back = await waitOnline()
  if (back) {
    log(`✅ 自动恢复成功：${back.user_id} ${back.nickname}`)
    await notifyOwner(`我掉线了，已经自动重新登录上线（${back.nickname}）。`)
    return true
  }
  log('⚠️ 密码登录失败，自动切「扫码模式」并弹出二维码…')
  await killNapCat()
  await new Promise((r) => setTimeout(r, 4000))
  await startNapCatQR()
  const qrOk = await showQRCode()
  if (qrOk) log('👀 二维码已弹出，请用手机扫码（扫完我会自动重连并通知你）')
  else log('⚠️ 二维码没拿到，请手动检查 NapCat')
  const back2 = await waitOnline(900000)
  if (back2) {
    log(`✅ 扫码后已上线：${back2.user_id} ${back2.nickname}`)
    await notifyOwner(`掉线后我已弹出二维码，现在重新上线了（${back2.nickname}）。`)
    return true
  }
  return false
}

async function main() {
  log(`=== QQ 掉线守护启动，每 ${CFG.intervalMinutes} 分钟检查一次 ===`)
  // 启动时先检查一次
  await checkOnce().catch((e) => log('检查异常: ' + e.message))
  const ms = Math.max(120, Number(CFG.intervalMinutes) || 2) * 60 * 1000
  setInterval(() => { checkOnce().catch((e) => log('检查异常: ' + e.message)) }, ms)
}

main().catch((e) => { log('守护异常退出: ' + e.message); process.exit(1) })
