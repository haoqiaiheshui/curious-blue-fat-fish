# FAQ 与踩坑记录

真实排障过程中留下来的条目，按「症状 → 原因 → 解法」整理。

---

### Q1. 桥接日志刷 `忽略未授权会话 group:xxx`
**原因**：该群不在 `config.allow.groups`。
**解法**：把群号加进白名单并重启桥接。注意：**主人自己在该群发消息也会被忽略**，容易误判成掉线。

---

### Q2. QQ 空间点赞/评论返回 `ret:1001 系统繁忙`
**原因**：网页 API 被风控（`smoothpolicy`），任何参数变体都过不去。
**解法**：改用注入式客户端协议（SnowLuma），调用 `like_qzone/comment_qzone`，返回 `retcode: 0` 才代表成功。

---

### Q3. 空间巡游一直「赞 0 条」，日志说 `tid 不能为空`
**原因**：桥接返回的 feed 缺少 `tid`（SnowLuma 用 `key` 字段）。
**解法**：在桥接映射里 `tid = feed.key`；另外「已看缓存」会把失败条目也记进去，需要清 `visit-state.json`。

---

### Q4. 掉线守护每小时准时重启一次 NapCat，然后收到风控提醒
**原因**：没有登录配额，失败也继续尝试。
**解法**：加配额（每小时 ≤2 / 每天 ≤6）+ 退避；失败后走扫码，而不是无限重试。

---

### Q5. 明明掉线了，守护却不报
**原因**：守护进程卡住，或它正在恢复流程中被手动打断。
**解法**：加 `heartbeat.txt`（每轮写时间戳），外部可用心跳判断是否卡死并重启守护。

---

### Q6. `uiautomator dump` 一直报 `could not get idle state`
**原因**：界面有持续动画（音乐可视化、广告轮播），或读了旧的 xml。
**解法**：dump 前 `rm -f` 旧文件 + 重试；关闭系统动画：
```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

---

### Q7. 自动化点击误入付费页
**原因**：用固定坐标点未知界面（网易云首页广告位）。
**解法**：只点「有明确文案的节点」（dump 出来的 text/desc），不点盲坐标；支付类页面绝不自动操作。

---

### Q8. 抖音在模拟器登录不了
**原因**：需要实名 + 刷脸，模拟器无摄像头且会被检测虚拟环境。
**解法**：不要在模拟器登录；改用电脑浏览器自动化（Playwright + 持久化 profile）。

---

### Q9. Playwright headless 打开抖音刷不出视频
**原因**：UA 里带 `HeadlessChrome`，被识别。
**解法**：显式设置真实 UA + `locale: zh-CN` + `timezoneId: Asia/Shanghai`。

---

### Q10. PowerShell 脚本里的中文变成乱码 / 报语法错误
**原因**：Windows PowerShell 5.1 读取无 BOM 的 UTF-8 会按 ANSI 解码。
**解法**：`.ps1` 一律存为 **UTF-8 with BOM**；Node 脚本反之（不要 BOM，读取时 `replace(/^\uFEFF/, '')`）。

---

### Q11. 桥接配置里写了 `false` 却不生效
**原因**：`loadConfig` 没读取该字段时它是 `undefined`，`x === false` 判断失败。
**解法**：改成 `file.x === true` 这种显式判断，并把字段加进 loader。

---

### Q12. 模拟器窗口找不到了（挪到屏幕外/最小化到托盘）
**解法**：用 Win32 `EnumWindows + SetWindowPlacement + ShowWindow` 恢复；
但注意 DPI 缩放会让坐标错位，最好让用户从桌面快捷方式重开。

---

### Q13. `SetThreadExecutionState` 报「指定的转换无效」
**原因**：32 位整数溢出。
**解法**：`[uint32]2147483649` 显式转换。

---

### Q14. Node 脚本里用 `require` 报错
**原因**：`.mjs` 是 ESM，没有 `require`。
**解法**：统一 `import { readFileSync } from 'node:fs'`。

---

### Q15. 一天掉线七八次，是腾讯在踢吗？
先别下结论。检查顺序：
1. 本机网络是否断过（`Test-NetConnection 223.5.5.5 -Port 443`）
2. 断网期间守护有没有乱重启
3. NapCat 的 QQ 进程还在不在（进程在但端口不通 = 插件挂了）

实测案例：用户家网络波动 → 每次断网守护都重启协议端 → 累积大量失败登录 → 反而更容易被风控。
