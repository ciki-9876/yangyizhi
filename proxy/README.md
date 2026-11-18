# 大模型代理

网页直接调用大模型有两个问题：

1. **密钥暴露**：填在网页里的密钥，打开开发者工具就能看到。自己用没关系，给别人用就不行。
2. **跨域被拦**：DeepSeek、OpenAI、通义等通常不允许网页直接调用，浏览器会报「连不上」。可以直连的是 Claude API 和 OpenRouter。

`worker.js` 是一个约 80 行的模型网关：密钥放在服务器上，补上跨域头，只放行你的来源和指定模型；每台设备每天限额；主模型出错时自动换备用模型。

它也是 App 里「官方」模型的后端：在 `src/config.json`（或远程配置）里填 `"official": { "label": "养一只", "base": "https://<网关域名>/v1", "model": "main" }`，用户不填密钥就能用。

## 部署到 Cloudflare Workers（免费额度够原型用）

```
npm i -g wrangler
wrangler login
cd proxy
wrangler init yangyizhi-llm --from-dash   # 或在控制台新建一个 Worker，把 worker.js 粘进去
wrangler secret put UPSTREAM_KEY          # 粘贴上游密钥
```

在控制台的 Settings → Variables 里加：

| 变量 | 例子 |
|---|---|
| `UPSTREAM_BASE` | `https://api.deepseek.com` |
| `ALLOWED_ORIGINS` | `https://ciki-9876.github.io` |
| `ALLOWED_MODELS` | `deepseek-chat` |
| `FALLBACK_BASE` / `FALLBACK_KEY` / `FALLBACK_MODEL` | 备用模型，可选 |
| `DAILY_LIMIT` | 每台设备每天次数，默认 80；需绑定 KV 命名空间 `QUOTA` |

安卓 App 的来源是 `https://localhost`，要加进 `ALLOWED_ORIGINS`。

然后在应用里：设置 → 接入大模型 → 自建代理，地址填 `https://<worker 域名>/v1`，密钥留空，模型填 `deepseek-chat`，点「测试并启用」。

## 国内访问

`workers.dev` 域名在中国大陆访问不稳定。面向国内用户时，把同一段逻辑部署到阿里云函数计算或腾讯云云函数（都支持标准 fetch 的 Node 运行时），或给 Worker 绑一个自己的域名。

## 局限

来源检查能挡住普通的盗用，挡不住有意伪造请求头的脚本。正式上线要换成账号体系加每人每日额度，见 `docs/agent-infra.md`。
