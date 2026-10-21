// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// B站巡游：刷首页推荐、看视频、点赞、偶尔收藏
import { dump, tap, sleep, launch, back, APPS, findByText, findById, findByDesc } from './lib.mjs'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const HOME = 'D:\\skill\\android-bot'
const LOG = join(HOME, 'bili.log')

export function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}

/** 打开 B站首页 */
export async function openHome() {
  launch(APPS.bili)
  await sleep(7000)
  const nodes = dump()
  const tab = nodes.find((n) => (n.text === '首页' || n.desc.includes('首页,5之1')) && n.bounds[1] > 1700)
  if (tab) { tap(...tab.center); await sleep(3000) }
  return dump()
}

/** 从首页 dump 里提取视频卡片（返回坐标） */
function topVideos(nodes) {
  const cards = nodes.filter((n) => n.id.includes('title') && n.bounds[1] > 300 && n.bounds[1] < 1600 && n.text?.length > 4)
  return cards.slice(0, 8)
}

/** 看一条视频：点入 → 点赞 → 返回 */
export async function watchOne(card, { like = true, fav = false, watchMs = 12000 } = {}) {
  const title = card.text
  tap(card.center[0], card.center[1] - 40)   // 点标题上方，进播放页
  await sleep(6000)
  let nodes = dump()
  // 有时点到了卡片但没进播放页，再点一次标题
  if (!nodes.some((n) => n.id.includes('frame_like'))) {
    tap(card.center[0], card.center[1])
    await sleep(5000)
    nodes = dump()
  }
  const likeBtn = nodes.find((n) => n.id.includes('frame_like'))
  let liked = false
  if (like && likeBtn) {
    const desc = likeBtn.desc || ''
    if (!desc.includes('已点赞')) {
      tap(...likeBtn.center)
      await sleep(1500)
      liked = true
    }
  }
  let faved = false
  if (fav) {
    const favBtn = nodes.find((n) => n.id.includes('frame_fav'))
    if (favBtn && !(favBtn.desc || '').includes('已收藏')) {
      tap(...favBtn.center)
      await sleep(1800)
      faved = true
    }
  }
  await sleep(watchMs)     // 模拟观看
  back()
  await sleep(2500)
  return { title, liked, faved }
}

/** 巡游 minutes 分钟 */
export async function browse(minutes = 20, opts = {}) {
  const endAt = Date.now() + minutes * 60 * 1000
  const seen = []
  log(`B站巡游开始（${minutes} 分钟）`)
  let nodes = await openHome()
  let round = 0
  while (Date.now() < endAt) {
    const cards = topVideos(nodes)
    if (!cards.length) {
      log('没抓到视频卡片，重进首页')
      nodes = await openHome()
      continue
    }
    const card = cards[Math.floor(Math.random() * Math.min(4, cards.length))]
    const r = await watchOne(card, opts)
    seen.push(r)
    log(`看：${r.title}${r.liked ? '  👍' : ''}${r.faved ? '  ⭐' : ''}`)
    round++
    if (round % 3 === 0) {
      nodes = await openHome()
    } else {
      nodes = dump()
      const homeTab = nodes.find((n) => (n.text === '首页') && n.bounds[1] > 1700)
      if (homeTab) { tap(...homeTab.center); await sleep(2500); nodes = dump() }
    }
  }
  const liked = seen.filter((s) => s.liked).length
  log(`B站巡游结束：看 ${seen.length} 条，赞 ${liked} 个`)
  return { seen, liked }
}

if (process.argv[1]?.endsWith('bili.mjs')) {
  const mins = Number(process.argv[2]) || 15
  browse(mins, { like: true, fav: Math.random() < 0.25 }).then((r) => {
    console.log(JSON.stringify({ count: r.seen.length, liked: r.liked, titles: r.seen.map((s) => s.title).slice(0, 10) }))
    process.exit(0)
  })
}
