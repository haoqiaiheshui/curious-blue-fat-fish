# 技术文档：链路、状态机与数据结构

本文描述这套机器人「从一条 QQ 消息进来，到一条回复出去」的完整技术细节，以及各守护进程的状态机。

---

## 1. 消息链路

```
QQ 用户
  │ 发消息
  ▼
NapCat（NTQQ + OneBot v11 插件）
  │ WebSocket 推送事件 / HTTP 提供 API
  ▼
qq-bridge
  ├─ 1. 准入判断（群白名单 / 私聊白名单 / 陌生人策略）
  ├─ 2. 主人运维指令拦截（本地执行，不进模型）
  ├─ 3. 其它消息 → 组装唤醒 prompt → DSH session.prompt
  ▼
DSH（DeepSeek Harness）
  ├─ agent 读取角色卡/记忆/黑话/消息快照
  ├─ 通过 MCP 工具（qq_*）看消息、看图、发表情、发消息
  └─ 工具调用 → SnowLuma MCP → OneBot API → QQ
```

关键点：**模型不直接接触 QQ 协议**，它只调 MCP 工具；协议层细节全部由桥接与 MCP 服务封装。

---

## 2. 准入与权限分层

| 层级 | 判定位置 | 说明 |
|---|---|---|
| 群白名单 | `config.allow.groups` | 不在名单的群消息直接丢弃（日志 `忽略未授权会话`）|
| 私聊白名单 | `config.allow.private` | 只回名单内 QQ |
| 陌生人策略 | `privateWhitelistMode` | `friends` / `all` / 白名单 |
| 陌生人敏感过滤 | 桥接正则 | 涉钱/身份/联系方式/模型自曝 → 不回 |
| 主人指令 | `ownerQQ` | 仅主人私聊可触发本地执行；含口令校验 |
| 模型工具面 | preset 白名单 | QQ 会话不带本地 shell/文件工具（硬边界）|

---

## 3. 唤醒状态机（reserved2 仿真模式）

```
        ┌──────────┐  有消息/被@/拍一拍
        │  潜水     │◀──────────────┐
        └────┬─────┘               │
             │ 触发条件命中          │ 观察窗口内无人说话
             ▼                      │
        ┌──────────┐   等待/回应    │
        │  参与回合 │───────────────┘
        └────┬─────┘
             │ 无话可说 / 对方结束
             ▼
        ┌──────────┐
        │ 沉睡前观察 │  (默认 5 分钟静默)
        └──────────┘
```

- 唤醒条件：@、名字、关键词、提问、拍一拍、指定成员、概率、anyMessage
- 睡眠窗口（00:30-07:30）内**完全不唤醒**，连定时器都不排
- 每轮结束必须落一个收尾动作：`mark_read(throughSeq)` 或 `set_wake_config(...)`

---

## 4. 掉线检测状态机（watchdog）

```
每 2 分钟
   │
   ▼
探活 get_login_info
   ├─ 成功 → 记心跳，continue
   └─ 失败
        ▼
     网络是否通？ ── 否 ──▶ 记日志「本机断网，等待恢复」，不重启
        │ 是
        ▼
     登录尝试配额（每小时≤2，每天≤6）
        ├─ 超限 → 等退避窗口
        └─ 允许 → 记录尝试 → 重启 NapCat（快速登录）
                   ├─ 90 秒内上线 → 通知主人「已自动恢复」
                   └─ 失败 → 扫码模式
                              ├─ 抓取 qrcode.png → 放大 → 本地打开
                              ├─ 上传/推送到手机（ntfy）
                              └─ 等扫码（最长 15 分钟）
```

设计动机：**频繁重登是风控最大触发器**，所以引入了配额 + 断网判定，避免「网络抖动 → 反复登录 → 被判定异常」。

---

## 5. 每日调度

| 时间 | 任务 | 实现 |
|---|---|---|
| 00:25 | 私聊主人「晚安」 | `qq-sleepgreet/greet.mjs` |
| 00:30 | 切精简模式（停娱乐、省内存）| `qqbot/mode-scheduler.mjs` |
| 07:30 | 切完整模式（恢复娱乐）| 同上 |
| 07:35 | 私聊主人「早安」| 同上 |
| 10:00-21:00 随机 | 抓网络热点 → 生成分享 → 发空间/私聊 | `webapps/daily.mjs` |
| 09:30-22:00 随机 | 模拟器刷抖音式巡游（B站/网易云）| `android-bot/daily.mjs` |
| 每小时 | 空间巡游点赞 | `qqzone-poster/hourly-visit.mjs` |
| 21:30 | 写日记并发说说 | `qqzone-poster/post.mjs` |
| 每 2 分钟 | 掉线探活 | `qq-watchdog/watch.mjs` |
| 每 2 分钟 | 额度检查 | `qqbot/budget.mjs` |

---

## 6. 额度守护

数据来源：桥接的 token 账本（JSONL，每行一次 LLM 调用的 token 计量）。

```
今日已花 = 桥接累计成本 - 当日零点基线
70%  → 私聊提醒
85%  → 切精简模式（停掉娱乐性 LLM 调用）
98%  → 再提醒一次，保持精简
```

---

## 7. 空间巡游数据结构

桥接 `/api/socialV2/qzone-feeds` 返回（SnowLuma 路径）：

```json
{
  "ok": true,
  "feeds": [
    {
      "name": "好友昵称",
      "content": "说说正文（已清洗 HTML/空白）",
      "uin": "好友QQ",
      "time": "1792510520",
      "tid": "b62ed85a388ad76a94590c00"
    }
  ]
}
```

> `tid` 由 SnowLuma 的 `key` 字段映射而来，是点赞/评论接口的必需参数；
> 早期缺这一列导致「tid 不能为空」，是排障记录里最典型的一例。

---

## 8. 模拟器自动化（ADB）

```
lib.mjs
  ├─ dump()       uiautomator dump → 解析节点(text/desc/id/bounds) → 返回结构化数组
  ├─ tap/swipe    input tap / input swipe
  ├─ launch(pkg)  resolve-activity → am start -n
  └─ waitForText  轮询等待
```

注意点：
- 每次 dump 前删掉旧 xml，并重试多次（`could not get idle state` 很常见）
- 关掉系统动画（`settings put global *_animation_scale 0`）能显著提升 dump 成功率
- 弹窗类广告不要用坐标乱点，只点明确文案对应的节点（曾误入付费页）

---

## 9. 关键配置文件

```jsonc
// bridge config.json（节选）
{
  "ownerQQ": "<主人QQ>",
  "allow": { "groups": ["<群号>"], "private": ["<QQ>"] },
  "privateWhitelistMode": "friends",
  "requests": { "autoAcceptGroupInvite": false, "autoAcceptFriend": false },
  "socialV2": {
    "sleepWindow": { "enabled": true, "start": "00:30", "end": "07:30" },
    "wake": { "recommendedProbability": 0.3, "maxWakePerHour": 20 }
  },
  "snowlumaWebui": { "baseUrl": "http://127.0.0.1:5099", "user": "admin", "password": "<密码>" }
}
```
