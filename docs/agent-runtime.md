# Agent 运行时说明（给开发者和 Codex）

`src/agent/` 下的模块由 `src/build.py` 按顺序内联进 `dist/index.html`，挂在 `window.Agent` 上。界面代码 `src/app.js` 只通过这些模块和模型打交道。

| 文件 | 内容 | 能否在 Node 里跑 |
|---|---|---|
| `guard.js` | 红线后检 `checkOut`、危机识别 `crisis`、依赖信号 `dependence` | 能（评测脚本用） |
| `rhythm.js` | 节奏引擎 `plan`：下一串提醒的时间和类型（纯函数） | 能（`rhythm-sim.js` 模拟） |
| `core.js` | `Platform`（网页/安卓/桌面适配）、`Config`（远程配置）、`Events`（事件日志）、`Trace`（调用追踪） | 否 |
| `brain.js` | `AI`（模型来源）、`Prompts`（提示词注册表）、`Brain.run`（一次调用的管线） | 否 |
| `memory.js` | `Memory`（记忆块）、`Nudge`（提醒排程）、`Tools`（计时、日历） | 否 |

## 一次模型调用

```
Brain.run(提示词编号, 数据, { messages? })
  → 远程配置把这个提示词关了 / 没有模型：直接返回 { out: null }
  → 按 strings.js 里的 P[编号] 生成提示词
  → 调用（json 或 text，按注册表里的档位）
  → norm() 整理成固定结构，不合格就带着「格式不对」重试一次
  → Guard.checkOut() 检查红线，不过就带着原因重试一次
  → 记一条追踪（编号、版本、来源、模型、耗时、是否重试、被拦原因；不含用户原话）
  → 返回 { out, err, tr }；out 为 null 时调用方用预写台词
```

模型来源的优先级：用户自带密钥 > 官方网关（`config.json` 的 `official`）> claude.ai 宿主 > 无。

## 新增一个提示词

1. 在 `src/strings.js` 的 `P` 里写正文（需要记忆就接收 `mem` 参数，用 `memBlock(mem)` 插入）。
2. 在 `src/agent/brain.js` 的 `Prompts` 里登记：`v`（版本，改正文就加一）、`tier`、`fmt`、`norm`、`check`（哪些字段过红线）。
3. 在 `evals/redline.mjs` 里加至少两条用例。
4. 调用处用 `Brain.run`，并准备好 `out` 为 null 时的预写台词。

## 存档里新增的数据

存档仍是 `v: 2`（规则引擎不变），新增字段都可以缺省，旧存档打开时自动补上：

| 字段 | 内容 |
|---|---|
| `S.events` | 事件日志：`report` `answer` `promise` `chat` `open` `nudge.sent` `nudge.open` `timer.*` `calendar` `molt` `release` `crisis`（只记级别）`feedback` `mem.*` `minor` `import` |
| `S.mem` | `goals[目标id]` = { progress, stuck, rhythm, promises, edited, forgot, src, at }；`user` = { habits, returns, likes, edited, forgot } |
| `S.agent` | `nudge`（开关、安静时段、只提醒约定、已发出、排好的、预写文案）、`timer`、`minor`、`usage`（每天前台秒数）、`lastActive` |

不进存档、只在本机的：模型配置 `yangyizhi.llm.v1`、调用追踪 `yangyizhi.trace.v1`、远程配置缓存 `yangyizhi.config.v1`、设备号 `yangyizhi.did`。

## 远程配置（`src/config.json`，构建时复制到 `dist/config.json`）

| 键 | 作用 |
|---|---|
| `flags` | `chat` `memory` `nudges` `tools` `feedback` `officialModel` 功能开关 |
| `disabledPrompts` | 关掉某个提示词，退回预写台词（线上出问题时的回滚手段） |
| `official` | 官方模型网关：`{ label, base, model, quick }`，配了以后用户不填密钥也能用 |
| `traceUrl` | 调用追踪和反馈的上报地址（POST JSON）；为空则只存本机 |
| `filing` | 设置页「关于」里公示的模型及备案号 |
| `limits` | `chatDaily` `chatOnlyDays` `useMinutes` `minorMinutes` |
| `remote` | 远程配置地址（https）。读到后缓存 6 小时，覆盖上面的值 |

## 安卓

- 本地通知：`@capacitor/local-notifications`。第一次约好下一小步后才询问通知权限；不申请精确闹钟权限，提醒可能有几分钟偏差。
- 通知图标：`res/drawable/ic_stat_yangyizhi.xml`（白色单色）。
- 日历：`YangyizhiCalendarPlugin` 调起系统日历的新建事件页，不需要日历权限。
- 改了依赖后要执行 `npm install && npm run android:sync`。

## 测试

```
node src/agent/rhythm-sim.js        # 提醒节奏 60 天模拟
node src/sim.js                     # 成长数值模拟
cd tests && python3 mock_llm.py 8765 & python3 mock_llm.py 8766 --nocors &
python3 e2e.py && python3 e2e_llm.py && python3 e2e_agent.py
EVAL_BASE=… EVAL_KEY=… EVAL_MODEL=… node evals/redline.mjs --save-baseline   # 第一次用真实模型跑，存基线
```
