# 模块清单

每个自研脚本的职责、入口参数与依赖。

---

## qqbot/

| 文件 | 作用 | 用法 |
|---|---|---|
| `mode.ps1` | 模式切换：`lite`（只留核心）/`full`（娱乐全开）/`status` | `powershell -File mode.ps1 full` |
| `mode-scheduler.mjs` | 按时间自动切模式（00:30 精简、07:30 完整），每天只切一次 | `node mode-scheduler.mjs` |
| `budget.mjs` | 每日额度守护：从桥接账本算今日花费，70% 提醒 / 85% 停娱乐 / 98% 再提醒 | `node budget.mjs`（常驻）|
| `status-report.mjs` | 一屏运行状态：QQ/桥接/空间/模拟器/内存/服务/额度/今日任务 | `node status-report.mjs` |
| `remote-cmd.mjs` | （可选）通过 ntfy 话题下发指令；默认关闭 | `node remote-cmd.mjs` |

### mode.ps1 的服务清单

**核心（精简模式也保留）**
- NapCat + QQ
- qq-bridge
- 掉线守护
- 防休眠
- 模式调度器
- 额度守护
- SnowLuma（空间读写）

**娱乐（仅完整模式）**
- 抖音巡游 / 网页应用 / 空间巡游 / 日记守护 / 装扮守护 / 热梗学习 / 问候守护 / 桌宠

---

## watchdog/

| 文件 | 作用 |
|---|---|
| `watch.mjs` | 探测 QQ 登录态；掉线→区分断网→配额内重启→失败则扫码并把二维码推到手机 |

关键配置（`config.json`）：

```jsonc
{
  "napcatDir": "<NapCat 目录>",
  "napcatExe": "NapCatWinBootMain.exe",
  "account": "<小号QQ>",
  "intervalMinutes": 2,
  "ntfyTopic": "<手机推送话题, 可空>",
  "ntfyPush": true
}
```

行为要点：
- 断网时**不重启、不生成二维码**，只记日志
- 登录配额：每小时 ≤2 次、每天 ≤6 次（防止频繁重登触发风控）
- 扫码模式会把二维码放大后再推送到手机（ntfy 附件）

---

## lifestyle/

| 文件 | 作用 |
|---|---|
| `greet.mjs` | 00:25 私聊主人「晚安」、07:35「早安」，文案由 LLM 生成（10-25 字）|

---

## deskpet/

| 文件 | 作用 |
|---|---|
| `pet-server.mjs` | 本地 HTTP 服务（:3210），页面显示今日已用/剩余额度，10 秒刷新 |
| `fish-round.png` | 圆角头像素材 |
| `start-pet.bat` | 启动 Edge `--app` 窗口，位置固定在屏幕右下 |

数据来源：DeepSeek 余额 API + 桥接 token 账本。

---

## android-bot/

| 文件 | 作用 |
|---|---|
| `lib.mjs` | ADB 控制库：dump/tap/swipe/launch/waitForText/APPS 常量 |
| `bili.mjs` | B 站巡游：刷首页 → 进视频 → 点赞 → 偶尔收藏 |
| `netease.mjs` | 网易云：每日推荐 → 播放 → 红心 → 下一首（固定坐标，避免误点广告）|
| `weibo.mjs` | 微博：刷推荐流 → 给帖子点赞 |
| `daily.mjs` | 任意一天随机时段挑一个 App 玩 15-20 分钟，结束后私聊汇报 |

注意事项：
- 坐标基于 1080x1920，换分辨率需重算
- 不要用坐标乱点未知界面（可能进付费页）
- `uiautomator dump` 失败很常见，务必「删旧文件 + 重试」并关闭系统动画

---

## 其它娱乐脚本（可选）

| 模块 | 作用 |
|---|---|
| `qqzone-poster/post.mjs` | 每天 21:30 把当天日记发到 QQ 空间（带每日限额：≤2 条、间隔 ≥3h）|
| `qqzone-poster/hourly-visit.mjs` | 每小时刷好友动态并点赞，偶尔评论 |
| `webapps/daily.mjs` | 抓微博/知乎/B站/百度等热榜，生成分享发空间 + 私聊主人 |
| `douyin-bot/session.mjs` | Playwright 驱动 Edge 刷抖音（headless + 真实 UA，不弹窗）|
| `qq-meme/learn.mjs` | 学群聊黑话并写回桥接的黑话库 |
| `qq-sleepgreet/greet.mjs` | 晚安/早安 |

---

## 安全相关模块

| 模块 | 作用 |
|---|---|
| 桥接 `handleOwnerOps` | 主人私聊运维指令：`我要发操作 <动作>`（只读查询免口令）|
| 桥接 `looksSensitiveFromStranger` | 陌生人问钱/身份/联系方式/模型信息 → 不回 |
| 桥接 `canAttempt`（在 watchdog 里）| 登录频率退避 |
| preset `qq-tool-restrict` | 从仿真会话注册期隐藏本地执行工具（铁律，勿删）|
