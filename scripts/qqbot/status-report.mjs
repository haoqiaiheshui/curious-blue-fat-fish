// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 一行式的整体状态报告（QQ/桥接/模拟器/额度/娱乐）
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const ADB = 'C:\\leidian\\LDPlayer9\\adb.exe'
const TOKEN = '<ONEBOT_TOKEN>'

function get(url, opts = {}) {
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri '${url}' ${opts.auth ? `-Headers @{authorization='Bearer ${TOKEN}'}` : ''}).Content } catch { 'ERR' }`
    ], { encoding: 'utf8', timeout: 20000 })
    return (r || '').trim()
  } catch { return 'ERR' }
}
function memGB() {
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "$os=Get-CimInstance Win32_OperatingSystem; [math]::Round($os.FreePhysicalMemory/1MB,1)"], { encoding: 'utf8', timeout: 15000 })
    return Number((r || '0').trim())
  } catch { return 0 }
}
function procs() {
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }"], { encoding: 'utf8', timeout: 20000 })
    return String(r || '')
  } catch { return '' }
}

const out = []
const now = new Date()
out.push(`🕐 ${now.toLocaleString('zh-CN')}`)

// QQ 登录
let nick = ''
try {
  const j = JSON.parse(get('http://127.0.0.1:3000/get_login_info', { auth: true }))
  nick = j?.data?.nickname ? `${j.data.nickname}（${j.data.user_id}）` : ''
} catch {}
out.push(nick ? `🟢 QQ：${nick}` : '🔴 QQ：掉线')

// 桥接 / 空间：直接端口探活
function portUp(port) {
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1', ${port}); if ($c.Connected) { '1' } else { '0' } } catch { '0' } finally { $c.Close() }`],
      { encoding: 'utf8', timeout: 15000 })
    return (r || '').trim() === '1'
  } catch { return false }
}
out.push(`${portUp(3100) ? '🟢' : '🔴'} 桥接：${portUp(3100) ? '正常' : '不通'}`)
out.push(`${portUp(5099) ? '🟢' : '🔴'} 空间服务：${portUp(5099) ? '正常' : '不通'}`)

// 模拟器
let emu = '🔴 离线'
try {
  const d = execFileSync(ADB, ['devices'], { encoding: 'utf8', timeout: 15000 })
  if (d.includes('emulator-5554\tdevice')) {
    let fg = ''
    try {
      fg = execFileSync(ADB, ['shell', 'dumpsys activity activities'], { encoding: 'utf8', timeout: 20000 })
      const m = fg.match(/topResumedActivity.*?u0\s+([\w.]+)\//)
      fg = m ? m[1] : ''
    } catch {}
    emu = '🟢 在线' + (fg ? `（前台：${fg}）` : '')
  }
} catch {}
out.push(`📱 模拟器：${emu}`)

// 内存
const free = memGB()
out.push(`💾 内存：可用 ${free} GB`)

// 服务
const ps = procs()
const svc = [
  ['桥接', 'src\\bridge.js'], ['掉线守护', 'watch.mjs'], ['额度守护', 'budget.mjs'],
  ['模式调度', 'mode-scheduler.mjs'], ['空间巡游', 'hourly-visit.mjs'],
  ['遥控通道', 'remote-cmd.mjs']
]
const running = svc.filter(([, k]) => ps.includes(k)).map(([n]) => n)
const missing = svc.filter(([, k]) => !ps.includes(k)).map(([n]) => n)
out.push(`⚙️ 服务：${running.join('、') || '无'}${missing.length ? `｜未跑：${missing.join('、')}` : ''}`)

// 额度
try {
  const lines = readFileSync('D:\\skill\\qqbot\\budget.log', 'utf8').trim().split('\n')
  const last = lines[lines.length - 1] || ''
  const m = last.match(/¥([\d.]+)\s*\/\s*预算\s*¥([\d.]+)/)
  out.push(m ? `💰 今日额度：¥${m[1]} / ¥${m[2]}` : '💰 今日额度：未知')
} catch { out.push('💰 今日额度：未知') }

// 今日娱乐任务
try {
  const st = JSON.parse(readFileSync('D:\\skill\\android-bot\\state.json', 'utf8'))
  out.push(`🎮 今日模拟器：${st.lastRunDay === now.toLocaleDateString('sv-SE') ? '已跑过' : '还没跑（15:00 自动）'}`)
} catch { out.push('🎮 今日模拟器：还没跑') }

console.log(out.join('\n'))
