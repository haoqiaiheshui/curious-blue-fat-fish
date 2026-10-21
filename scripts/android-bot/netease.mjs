// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 网易云音乐巡游（固定坐标版，避免 uiautomator 在播放页失效/误点广告）
import { dump, tap, sleep, launch, back, APPS } from './lib.mjs'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const LOG = 'D:\\skill\\android-bot\\netease.log'
export function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}

// 播放页固定坐标（1080x1920，已实测）
const POS = {
  heart: [719, 1388],      // 红心
  next: [719, 1667],       // 下一首
  playPause: [534, 1667],  // 播放/暂停
  minimize: [60, 92],      // 收起播放页（左上角 v）
  dailyRecommend: null     // 首页「每日推荐」，运行时从 dump 里取
}

/** 打开网易云首页 */
export async function openHome() {
  launch(APPS.netease)
  await sleep(8000)
  return dump()
}

/** 打开每日推荐并播放第一首 */
export async function startDaily() {
  let nodes = await openHome()
  let entry = nodes.find((n) => n.text === '每日推荐')
  if (!entry) {
    // dump 失败时用固定坐标兜底（首页第一张卡片）
    log('没解析到「每日推荐」，用坐标兜底')
    tap(112, 613)
    await sleep(6000)
  } else {
    tap(...entry.center)
    await sleep(6000)
  }
  // 列表里点第一首歌（列表从 y≈500 开始）
  tap(540, 640)
  await sleep(6000)
  return true
}

/** 当前是否在播放页（靠截图判断太重，这里用简单探测：点完即认为在） */
export async function likeCurrent() {
  tap(...POS.heart)
  await sleep(1200)
  return true
}

export async function nextSong() {
  tap(...POS.next)
  await sleep(1500)
}

/** 听歌 minutes 分钟：每 1~2 分钟点一次红心、换一首 */
export async function listen(minutes = 15) {
  log(`网易云巡游开始（${minutes} 分钟）`)
  await startDaily()
  let liked = 0
  let songs = 0
  const endAt = Date.now() + minutes * 60 * 1000
  while (Date.now() < endAt) {
    // 红心（有概率，不是每首）
    if (Math.random() < 0.4) { await likeCurrent(); liked++ }
    songs++
    const wait = Math.min(90 * 1000, endAt - Date.now())
    if (wait <= 0) break
    await sleep(wait)
    if (Date.now() >= endAt) break
    await nextSong()
  }
  // 收起播放页
  tap(...POS.minimize)
  await sleep(1500)
  log(`网易云巡游结束：换歌 ${songs} 次，红心 ${liked} 次`)
  return { songs, liked }
}

if (process.argv[1]?.endsWith('netease.mjs')) {
  const mins = Number(process.argv[2]) || 10
  listen(mins).then((r) => { console.log(JSON.stringify(r)); process.exit(0) })
}
