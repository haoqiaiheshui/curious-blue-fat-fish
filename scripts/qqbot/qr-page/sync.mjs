// 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
// 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

import { copyFileSync, statSync, existsSync } from 'node:fs'
const src = 'C:\\path\\to\\napcat\\onekey\\NapCat.52230.Shell\\versions\\9.9.33-52230\\resources\\app\\napcat\\cache\\qrcode.png'
const dst = 'C:\\path\\to\\qqbot-root\\qr-page\\napcat-qr-big.png'
let last = 0
console.log('QR 同步服务启动：每 2 秒检查 NapCat 二维码')
setInterval(() => {
  try {
    if (!existsSync(src)) return
    const m = statSync(src).mtimeMs
    if (m !== last) { copyFileSync(src, dst); last = m; console.log(new Date().toLocaleTimeString('zh-CN'), '已同步新二维码') }
  } catch {}
}, 2000)