// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 安卓自动化基础库：通过 ADB 控制模拟器里的 App
// 用法：import { adb, dump, tap, findText, findById, launch, back, home, swipe } from './lib.mjs'
import { execFileSync } from 'node:child_process'

export const ADB = 'C:\\path\\to\\ldplayer\\adb.exe'
export const SERIAL = process.env.ANDROID_SERIAL || 'emulator-5554'

export function adb(...args) {
  try {
    const out = execFileSync(ADB, ['-s', SERIAL, ...args], { timeout: 60000, encoding: 'utf8', windowsHide: true })
    return (out ?? '').toString()
  } catch (e) {
    return (e?.stdout ?? '') + (e?.stderr ?? '')
  }
}

export function shell(cmd) {
  return adb('shell', cmd)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 确保模拟器在线：不在线就自动启动 LDPlayer14 实例并等待启动完成（最多 150 秒）
export async function ensureEmulator() {
  for (let i = 0; i < 3; i++) {
    const out = adb('shell', 'echo ready')
    if (out.includes('ready')) return true
    if (i === 0) {
      try {
        execFileSync('C:\\path\\to\\ldplayer\\dnplayer.exe', ['index=0'], {
          cwd: 'C:\\path\\to\\ldplayer', timeout: 20000, windowsHide: true, detached: true, stdio: 'ignore'
        })
      } catch {}
    }
    await sleep(15000)
  }
  return false
}

export function tap(x, y) { shell(`input tap ${Math.round(x)} ${Math.round(y)}`) }
export function swipe(x1, y1, x2, y2, ms = 300) { shell(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${ms}`) }
export function key(name) { shell(`input keyevent ${name}`) }
export const back = () => key('4')
export const home = () => key('3')
export const enter = () => key('66')

export function text(str) {
  // 中文无法直接 input text，用 base64 + 广播的方式（需要 ADBKeyboard）；英文数字直接输
  if (/^[\x20-\x7E]*$/.test(str)) return shell(`input text "${str.replace(/(["\\$`])/g, '\\$1')}"`)
  return shell(`am broadcast -a ADB_INPUT_B64 --es msg '${Buffer.from(str, 'utf8').toString('base64')}'`)
}

/** 解析当前界面：返回 {text, desc, id, clickable, bounds:[x1,y1,x2,y2], center:[x,y]} 数组 */
// 首次使用时关掉系统动画，避免 uiautomator "could not get idle state"
let animOff = false
function ensureAnimOff() {
  if (animOff) return
  shell('settings put global window_animation_scale 0')
  shell('settings put global transition_animation_scale 0')
  shell('settings put global animator_duration_scale 0')
  animOff = true
}

export function dump(tag = 'ui') {
  ensureAnimOff()
  let raw = ''
  for (let i = 0; i < 5; i++) {
    shell('rm -f /sdcard/auto.xml')
    shell('uiautomator dump --compressed /sdcard/auto.xml')
    raw = shell('cat /sdcard/auto.xml')
    if (raw.includes('<hierarchy')) break
    shell('sleep 0.4')
  }
  const nodes = []
  const re = /<node[^>]*>/g
  let m
  while ((m = re.exec(raw))) {
    const s = m[0]
    const attr = (k) => {
      const r = new RegExp(`${k}="([^"]*)"`).exec(s)
      return r ? r[1] : ''
    }
    const b = attr('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)
    if (!b) continue
    const bounds = [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])]
    nodes.push({
      text: attr('text'),
      desc: attr('content-desc'),
      id: attr('resource-id'),
      cls: attr('class'),
      clickable: attr('clickable') === 'true',
      bounds,
      center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
      tag
    })
  }
  return nodes
}

export function findByText(nodes, txt, { exact = false } = {}) {
  return nodes.find((n) => (exact ? n.text === txt : n.text.includes(txt)))
}

export function findByDesc(nodes, txt) {
  return nodes.find((n) => n.desc.includes(txt))
}

export function findById(nodes, idPart) {
  return nodes.find((n) => n.id.includes(idPart))
}

/** 等待某个文字出现 */
export async function waitForText(txt, { timeout = 20000, interval = 1200, exact = false } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const n = findByText(dump(), txt, { exact })
    if (n) return n
    await sleep(interval)
  }
  return null
}

export function launch(pkg) {
  // 先解析出真正的 activity，再用 -n 启动（-p 方式在部分 App 上解析不到）
  let act = ''
  try {
    const res = shell(`cmd package resolve-activity --brief -c android.intent.category.LAUNCHER ${pkg}`)
    act = res.split('\n').map((x) => x.trim()).filter((x) => x.includes('/')).pop() || ''
  } catch {}
  if (act) shell(`am start -n ${act}`)
  else shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`)
  return act
}

export function forceStop(pkg) { shell(`am force-stop ${pkg}`) }

export function isInstalled(pkg) {
  return shell(`pm list packages ${pkg}`).includes(pkg)
}

export const APPS = {
  qq: 'com.tencent.mobileqq',
  bili: 'tv.danmaku.bili',
  netease: 'com.netease.cloudmusic',
  weibo: 'com.sina.weibo',
  zhihu: 'com.zhihu.android',
  xhs: 'com.xingin.xhs',
  douyin: 'com.ss.android.ugc.aweme',
  yyb: 'com.tencent.android.qqdownloader'
}
