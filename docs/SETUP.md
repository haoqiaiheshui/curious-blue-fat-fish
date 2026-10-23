# 部署指南：从零到跑起来

> 目标平台：Windows 10/11（x64）。Linux 也可，但守护脚本里的 PowerShell 部分需要改写。

---

## 0. 硬件与前置条件

| 项 | 建议 |
|---|---|
| 内存 | 16 GB（模拟器 3~4 GB + QQ 0.5 GB + 其它）|
| 磁盘 | 30 GB 空闲 |
| 网络 | 稳定（断网会导致协议端 session 失效，需要重登）|
| 账号 | **必须用 QQ 小号**，不要用主号 |

软件：
- Node.js ≥ 20（推荐 22 LTS）
- DeepSeek Harness（DSH）桌面端
- NapCat（OneBot v11 协议端）
- 可选：雷电模拟器 9（安卓娱乐自动化）

---

## 1. 安装 NapCat

1. 下载 NapCat（NTQQ 注入式协议端），解压到独立目录
2. 运行启动器，用小号**扫码登录**
3. 在 NapCat 配置里开启：
   - WebSocket 服务：`127.0.0.1:3001`，设置 access token
   - HTTP 服务：`127.0.0.1:3000`，同一个 token
4. 验证：浏览器访问 `http://127.0.0.1:3000/get_login_info`（带 Bearer token）应返回昵称

> 首次登录后，后续重启多数情况可「快速登录」，但**网络长时间中断后可能需要重新扫码**。

---

## 2. 安装 DSH 并配置模型

1. 安装并启动 DSH 桌面端
2. 配置模型 provider（本项目默认 DeepSeek，可换任意 OpenAI 兼容端点）
3. 确认 Web 端可访问（默认 `http://127.0.0.1:19387`）

---

## 3. 部署 qq-bridge

```bash
git clone <qq-bridge 仓库> derpyu-qq-bridge
cd derpyu-qq-bridge
npm install
copy config.example.json config.json
```

编辑 `config.json`：

```jsonc
{
  "ownerQQ": "你的主人QQ",
  "allow": {
    "groups": ["群号1", "群号2"],
    "private": ["主人QQ"]
  },
  "privateWhitelistMode": "friends",
  "requests": { "autoAcceptGroupInvite": false, "autoAcceptFriend": false },
  "socialV2": {
    "sleepWindow": { "enabled": true, "start": "00:30", "end": "07:30" }
  }
}
```

启动：

```bash
node src/bridge.js
```

看到 `SnowLuma 已连接 / 机器人昵称: xxx` 即成功。

---

## 4. 装配角色 Preset（可选）

桥接依赖 DSH 的 agent preset 提供「QQ 仿真人格 + 工具白名单」。

1. 把 `presets/qq-chat-v2.patch.yml` 放入 DSH 插件目录
2. 重启 DSH
3. 在桥接控制台确认 preset 可用

> 该 preset 里有一条**硬安全边界**：仿真会话不注册本地 shell/文件工具。
> 不要为了「让机器人帮你跑命令」而删掉它——那等于把整台机器开放给群里所有人。

---

## 5. 启动守护进程

按需启动，建议做成开机自启：

```powershell
# 掉线守护（2 分钟探活 + 手机二维码推送）
node D:\...\qq-watchdog\watch.mjs

# 额度守护（每天 ¥10）
node D:\...\qqbot\budget.mjs

# 睡眠/起床模式切换
node D:\...\qqbot\mode-scheduler.mjs
```

Windows 开机自启用 `启动文件夹 + .vbs` 或任务计划程序，注意：
- `.ps1` 含中文必须存为 **UTF-8 with BOM**
- 自启脚本里用「进程名/命令行匹配」做幂等判断，避免重复启动

---

## 6. 空间功能（SnowLuma）

QQ 空间的「评论/点赞」在网页 API 上被风控（返回 `ret:1001 系统繁忙`），
需要 SnowLuma 这类**注入式客户端协议**：

1. 启动 SnowLuma，登录 WebUI（默认 `127.0.0.1:5099`）
2. 等 NapCat 的 QQ 进程起来后，执行注入
3. 桥接配置里填 WebUI 地址与账号，然后：
   - 读动态：`GET /api/socialV2/qzone-feeds`
   - 点赞：`POST /api/socialV2/qzone-like`（`tid` 来自 feed 的 key）
   - 评论：`POST /api/socialV2/qzone-comment`

> NapCat 每次重启后注入会失效，需要重新注入（守护脚本里可以加）。

---

## 7. 安卓娱乐自动化（可选）

1. 安装雷电模拟器 9，创建 Android 实例
2. 安装 App（QQ / 哔哩哔哩 / 网易云 / 微博 / 知乎 / 小红书）
3. 手动登录（**抖音等需要实名+刷脸的 App 不建议在模拟器登录**）
4. 用 `adb devices` 确认 `emulator-5554`
5. 运行：
   ```bash
   node android-bot/bili.mjs 20      # 刷 B 站 20 分钟
   node android-bot/netease.mjs 15   # 听歌 15 分钟
   ```

---

## 8. 自启顺序（推荐）

```
0. 防休眠（SetThreadExecutionState）
1. NapCat（QQ 协议端）
2. qq-bridge
3. 掉线守护 / 额度守护 / 模式调度器
4. SnowLuma + 注入
5. 娱乐服务（仅在完整模式）
6. 模拟器（如需要）
```

启动前检查端口 `3001/3000` 是否就绪，不要盲等固定秒数。

---

## 9. 验证清单

- [ ] `http://127.0.0.1:3000/get_login_info` 返回昵称
- [ ] 桥接日志出现 `SnowLuma 已连接`
- [ ] 白名单群里 @ 机器人有回复
- [ ] 私聊主人发「状态」能收到运行报告
- [ ] 杀掉 NapCat 后，2 分钟内自动恢复（或手机收到二维码）
- [ ] 额度守护日志显示今日花费
