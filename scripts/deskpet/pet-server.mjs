// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

// 蓝色大肥鱼桌宠（浏览器版）：本地服务 + 小窗口页面，显示已用/剩余余额
import http from 'node:http'
import { readFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const KEY = readFileSync(join(HERE, 'api-key.txt'), 'utf8').trim()
const BRIDGE_TOKEN = readFileSync('C:\\path\\to\\derpyu-qq-bridge\\state\\console-token', 'utf8').trim()
const PORT = 3210
const LOG = join(HERE, 'pet-server.log')

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${m}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n', 'utf8') } catch {}
}

async function getBalance() {
  try {
    const r = await fetch('https://api.deepseek.com/user/balance', {
      headers: { authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(15000)
    })
    const j = await r.json()
    const cny = (j.balance_infos || []).find((x) => x.currency === 'CNY')
    return cny ? Number(cny.total_balance) : null
  } catch (e) { log('余额失败: ' + e.message); return null }
}

async function getUsed() {
  try {
    const r = await fetch('http://127.0.0.1:3100/api/tokens/summary', {
      headers: { 'x-console-token': BRIDGE_TOKEN }, signal: AbortSignal.timeout(15000)
    })
    const j = await r.json()
    return j?.totals?.cost != null ? Number(j.totals.cost) : null
  } catch (e) { log('用量失败: ' + e.message); return null }
}

const HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>蓝色大肥鱼</title>
<style>
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:transparent; overflow:hidden;
    font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif; -webkit-user-select:none; user-select:none; }
  #pet { width:100vw; height:100vh; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:2px; padding:6px 8px;
    background:radial-gradient(circle at 50% 30%, rgba(20,40,70,.92), rgba(8,14,24,.96));
    border:1px solid rgba(80,170,255,.45); border-radius:16px; cursor:move; }
  img { width:150px; height:150px; border-radius:50%;
    box-shadow:0 0 18px rgba(70,160,255,.55); }
  .name { color:#7cc8ff; font-size:13px; font-weight:700; letter-spacing:1px; }
  .row { font-size:12.5px; display:flex; gap:6px; align-items:baseline; }
  .used { color:#ffbe78; }
  .remain { color:#82ffb4; font-weight:700; }
  .tip { color:#5f7590; font-size:10px; margin-top:2px; }
  .dot { width:6px; height:6px; border-radius:50%; background:#3ee08a; display:inline-block; }
</style></head>
<body>
<div id="pet">
  <img src="/fish.png" alt="fish">
  <div class="name">蓝色大肥鱼</div>
  <div class="row used">已用 <span id="used">¥--</span></div>
  <div class="row remain">剩余 <span id="remain">¥--</span></div>
  <div class="tip"><span class="dot"></span> 10 秒自动刷新</div>
</div>
<script>
  async function refresh() {
    try {
      const r = await fetch('/api/balance');
      const j = await r.json();
      document.getElementById('used').textContent = j.used != null ? '¥' + j.used.toFixed(2) : '获取失败';
      document.getElementById('remain').textContent = j.remain != null ? '¥' + j.remain.toFixed(2) : '获取失败';
    } catch (e) {
      document.getElementById('used').textContent = '网络错误';
    }
  }
  refresh();
  setInterval(refresh, 10000);
</script>
</body></html>`

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url.startsWith('/index')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(HTML)
    return
  }
  if (req.url.startsWith('/fish.png')) {
    try {
      const buf = readFileSync(join(HERE, 'fish-round.png'))
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' })
      res.end(buf)
    } catch { res.writeHead(404); res.end() }
    return
  }
  if (req.url.startsWith('/api/balance')) {
    const [remain, used] = await Promise.all([getBalance(), getUsed()])
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, remain, used, at: Date.now() }))
    return
  }
  res.writeHead(404); res.end()
})

server.listen(PORT, '127.0.0.1', () => log(`桌宠服务启动 http://127.0.0.1:${PORT}`))
