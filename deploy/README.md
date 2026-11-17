# 腾讯云部署方案

目前项目是纯静态网页，没有账号、云同步或服务端数据库。首期用独立腾讯云 CVM + Caddy 提供 Web 与更新文件，不创建空数据库，也不复用拾光的 `/opt/shiguang`、`/var/lib/shiguang`、服务名、域名或密钥。新服务的唯一数据区为 `/opt/yangyizhi`，发布目录按版本不可变保存，`current` 符号链接切换；每次发布保留旧版本和回滚指针。

## 首次准备

1. 准备一台新 CVM 或明确隔离的实例、独立域名（如 `app.example.com`）、可用 SSH 账号、DNS 解析和 HTTPS 证书。不要在拾光机器上改反向代理或复用其 TLS 配置。
2. 安装 Caddy、Python 3、curl、tar、flock；创建 `/opt/yangyizhi/releases`、`/opt/yangyizhi/backups`，由管理员拥有且目录权限为 0755。
3. 把 `Caddyfile.example` 中的域名替换为新域名，安装为独立 Caddy 站点配置并校验；启用 Caddy 的 systemd 开机启动（`systemctl enable --now caddy`），配置变更后 reload。Caddy 自动签发/续期 HTTPS；CVM 防火墙只开放 TCP 80/443 和限制来源的管理 SSH。访问日志写入 `/var/log/caddy/yangyizhi-access.log`，按 20 MiB 滚动并保留 5 份、最多 7 天；先创建该目录并授权 Caddy 用户写入。
4. 确保站点根目录是 `/opt/yangyizhi/current/site`，更新文件路径是 `/opt/yangyizhi/current/updates`；在腾讯云侧限制 SSH 仅接受受信来源。脚本用 `sudo` 以 root 创建隔离目录，不调用 `systemctl`，因为没有动态服务进程；Caddy 是现有 Web 服务。

## 发布/回滚

发布目录需包含 `site/index.html`、`site/version.json` 和可选的 `updates/`。从项目根目录执行：

```sh
deploy/publish.sh <SSH_HOST_ALIAS> https://<新域名>/healthz <release-dir>
```

脚本将压缩包传至远端临时目录，先核对 SHA-256、路径白名单、大小和入口文件，再生成唯一 release、备份旧 `current` 指针并原子切换。最后访问公开 HTTPS `/healthz`；失败时自动恢复旧指针并再次健康检查，release 与日志保留供排查。成功版本和前一版本写入独立备份目录。

```sh
deploy/rollback.sh <SSH_HOST_ALIAS> <release-id> https://<新域名>/healthz
```

正式包准备顺序：从 Actions 分别下载 `web`、Windows、Android release 与 macOS 两架构产物，放入 `artifacts/release-input/`。只将可发布的 APK（不是 debug 包）、Windows NSIS `.exe`、macOS updater `.zip` / 安装 `.dmg` 与 `web.zip` 放入输入目录。准备新版本说明后，使用本机私钥签名：

```sh
node scripts/release-manifest.mjs \
  --assets artifacts/release-input \
  --out artifacts/release-updates/stable.json \
  --baseUrl https://<新域名>/updates/ \
  --notes clients/releases/<版本>.md \
  --privateKey "$HOME/.local/share/yangyizhi/signing/update-private.pem" \
  --previous artifacts/current-updates/stable.json
node scripts/prepare-deploy.mjs \
  --web dist \
  --updates artifacts/release-updates \
  --out artifacts/deploy/<版本>
deploy/publish.sh <SSH_HOST_ALIAS> https://<新域名>/healthz artifacts/deploy/<版本>
```

首次发布不传 `--previous`。后续发布应传上一版 `stable.json` 及同目录哈希文件，脚本会验签、校验旧包并保留未变更平台的更新入口，再签发新清单。更新客户端下载目录必须与客户端 `manifestUrl` 一致；首次设置新域名时，同时改 `clients/update-config.json`，重新构建全部客户端并发布，不能只改服务器 Caddy 配置。

不要用 `rsync --delete` 覆盖线上目录。保留最近发布目录由运维确认后清理，不在发布中自动删除。更新清单和安装包放到 SHA-256 命名目录，先传文件，再原子替换 `stable.json`；不可把 Actions 临时产物当唯一下载源。

## 账号/同步与备份

当前数据仅在用户浏览器本机 localStorage，无服务器数据库。若未来增加账号云同步，需单独评审服务端 API、认证、数据迁移和隐私后再建立独立数据库（例如新建专属 PostgreSQL 实例/数据库和凭据），不得连接拾光数据。迁移先备份、向前迁移在事务内完成，回滚先停服务再恢复快照；每日加密逻辑备份、保留至少 7 天，每月抽样恢复验证。具体存储产品、RPO/RTO 和账号策略需在功能需求确定后再定。

### 当前尚需提供

- 腾讯云新实例的 SSH 主机别名/地址与部署用户（或配置好的本机 SSH key），新域名及 DNS 管理方式。
- 新站点 HTTPS 证书方案；若使用 Caddy 自动证书只需域名 DNS/公网端口可达，不需提交私钥。
- Tencent COS bucket/region/访问凭据仅在决定用 COS 做安装包分发时需要；首版可通过独立 CVM 下载目录发布。
- 稳定 Android 发布 keystore 和密码；Apple Developer ID/公证材料用于公众 macOS 分发。Windows 商业代码签名证书可后续补充。
- 更新清单 RSA 私钥需创建后备份到两处受控离线位置；公钥固定进客户端。不要把私钥、keystore 或凭据发在聊天或提交到仓库。
