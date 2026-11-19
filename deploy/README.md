# 腾讯云部署方案

云端采用拾光验证过的工程模式：同源静态前端 + loopback Node.js 账号 API + Caddy HTTPS 反向代理。养一只独立使用 `/opt/yangyizhi`、`/var/lib/yangyizhi`、`/srv/yangyizhi/updates`、`yangyizhi.service`、端口 `127.0.0.1:52171` 和 `/yangyizhi/` 路径；不得读写拾光目录或使用拾光服务名。发布代码保存在不可变版本目录，由 `current` 符号链接切换；账号数据与更新安装包目录各自隔离，回滚代码不回滚数据。

当前本地实现与测试已具备，腾讯云线上账号服务尚未部署。入口已选为现有主机的 `/yangyizhi/` 路径，IP 的 HTTPS 证书校验通过。Web 页面和 API 同源以使用 HttpOnly Cookie；Android 与 Electron 原生客户端通过固定的 HTTPS API 地址发送 Bearer 会话。

## 账号与云存档

- 数据文件为 `/var/lib/yangyizhi/workspace.json`，JSON 根格式 `{version:1,users:[...],nativeSessions:[...]}`。每个账号包含 UUID、用户名规范化字段、随机盐、scrypt 密码摘要、养一只 v2 存档和递增 `revision`；服务端不保存明文密码或原生令牌。
- 存档保留养一只 `v:2` 的完整状态，包括当前目标、日志、完成的伙伴、设置、记忆和事件。单个存档最多 5 MiB。写入通过单进程串行队列、修订号比较、临时文件 `fsync` 和原子 rename 完成；旧设备的写入收到 HTTP 409，不会覆盖较新的云端存档。
- Web 会话使用 HttpOnly、SameSite=Lax、生产环境 Secure Cookie；服务重启后需重新登录。Android 原生令牌由 Android Keystore AES-GCM 加密，Windows/macOS Electron 使用系统安全存储加密；服务端只保存令牌 SHA-256 摘要，原生会话 30 天过期。
- 当前账号 API 有注册、登录、退出、账号信息、账号/云存档删除和版本化工作区读取/保存。接口不做字段级数据合并；首次登录发现本机与云端存档不同，会先让用户选择保留哪一份。网络不可用时继续保留本机存档，恢复网络后可手动同步。
- 密码使用随机盐 scrypt 哈希；账号输入与登录尝试限速；写接口检查 Origin；原生接口不接受 Cookie 或 Origin；请求体、存档体和总库均有大小上限。Node 只监听 loopback，公网只开放 Caddy 80/443 与限制来源的 SSH。

加密备份脚本 `scripts/workspace-backup.mjs` 每日生成 AES-256-GCM 加密快照，轮转 7 天。备份密钥应随机生成、文件权限 0600，另存到密码管理器；恢复前停止 `yangyizhi.service`，校验后原子替换 `/var/lib/yangyizhi/workspace.json` 并重启健康检查。代码回滚不会恢复旧数据文件。

## 首次准备

1. 入口已选为现有腾讯云主机上的 `https://81.70.181.205/yangyizhi/` 独立路径。主机现有 IP 证书通过 HTTPS 校验；路由、服务、数据文件、端口和更新目录各自隔离。远程部署还需要本机可用的 SSH 登录。不得变更拾光现有路由或服务。
2. 安装 Node.js 22+、Caddy、Python 3、curl、tar、flock。创建专用无登录系统用户 `yangyizhi`、`/opt/yangyizhi/releases`、`/var/lib/yangyizhi` 与可由 Caddy 读取的 `/srv/yangyizhi/updates`；状态目录为 0700，服务用户仅能写状态，不能修改部署代码。
3. 复制 `deploy/yangyizhi.service` 至 `/etc/systemd/system/`，准备 root 所有、0600 的 `/etc/yangyizhi.env`。必须设置新产品 HTTPS origin、`YANGYIZHI_COOKIE_PATH=/yangyizhi/`、loopback host 和端口 52171。
4. 把 `deploy/yangyizhi.Caddyfile` 路由片段加入现有 HTTPS 站点块的兜底处理之前。更新包通过 Caddy 从 `/srv/yangyizhi/updates` 单独提供；账号 API/Web 由 Node 提供。保留所有现有站点路由与 TLS 配置；执行 `caddy validate` 成功后再 reload。创建独立访问日志 `/var/log/caddy/yangyizhi-access.log`，按 20 MiB 滚动并保留 5 份、最多 7 天。
5. 云防火墙只开放 TCP 80/443 与限制来源的管理 SSH。Node 服务只监听 `127.0.0.1:52171`；不要将 52171 公网开放。首次部署前生成独立随机 32 字节备份密钥，写入 root-only `/etc/yangyizhi-backup.key`（0600），启用 `yangyizhi-backup.timer`。该密钥用于服务器数据备份，不是 Android 或更新签名密钥。

## 发布/回滚

账号服务发布包需包含 `server/`、构建后的 `dist/`、`scripts/workspace-backup.mjs`。使用 `deploy/publish-cloud.sh` 构建包、上传，并调用远端原子部署脚本。首次部署启用独立的 `yangyizhi.service`；每次切换代码前保留旧 release 与 current 指针。`/var/lib/yangyizhi` 不属于发布包，绝不能用代码归档覆盖。健康检查需使用产品入口的 `/yangyizhi/healthz`（若配置其他独立路径则对应调整），并验证 JSON 中 `ok: true`。

正式客户端发布时，更新包和签名清单由 Caddy 从独立的 `/srv/yangyizhi/updates` 提供，清单入口为 `https://81.70.181.205/yangyizhi/updates/stable.json`。使用 `deploy/publish-updates.sh <SSH_HOST_ALIAS> artifacts/release-updates` 发布时，脚本会按固定公钥验签并检查所有包的大小、SHA-256 和下载路径；远端先放入内容寻址的安装包，最后原子切换 `stable.json`，并留存上一份清单。清单有问题时用 `deploy/rollback-updates.sh <SSH_HOST_ALIAS> <UPDATE_RELEASE_ID> https://81.70.181.205/yangyizhi/updates/stable.json` 恢复上一份。Web 首页与账号 API 由同一 Node 服务提供，以保持 Cookie 与 API 同源。部署后从产品入口测试 `/yangyizhi/healthz`、`/yangyizhi/api/health`、注册/登录、跨设备读取、冲突保护和退出登录。

旧的静态下载目录流程仍可接收只包含 `site/`、`updates/` 的包，但账号云版应使用服务发布流程，不能把静态站点包直接当成云同步服务。

```sh
npm run build:web
deploy/publish-cloud.sh <SSH_HOST_ALIAS> https://81.70.181.205/yangyizhi/healthz
```

此脚本只发布云账号服务和 Web 应用，不发布签名客户端/安装包。它先校验 `dist/`，将服务端、Web 构建和备份脚本打成归档并计算 SHA-256；远端校验路径白名单与摘要，保存旧 `current` 指针，再原子切换并重启 systemd。公开 HTTPS 健康检查失败时会自动恢复旧版本并重启；已有账号数据会先使用服务器备份密钥生成加密部署前快照。数据目录不随代码回滚。归档和发布记录留在独立备份目录供排查。

```sh
deploy/rollback.sh <SSH_HOST_ALIAS> <release-id> https://81.70.181.205/yangyizhi/healthz
```

正式包准备顺序：从 Actions 分别下载 `web`、Windows、Android release 与 macOS 两架构产物，放入 `artifacts/release-input/`。只将可发布的 APK（不是 debug 包）、Windows NSIS `.exe`、macOS updater `.zip` / 安装 `.dmg` 与 `web.zip` 放入输入目录。准备新版本说明后，使用本机私钥签名：

```sh
export UPDATE_KEY_PASSPHRASE="$(security find-generic-password -a update-key-passphrase -s yangyizhi.signing -w)"
node scripts/release-manifest.mjs \
  --assets artifacts/release-input \
  --out artifacts/release-updates/stable.json \
  --baseUrl https://81.70.181.205/yangyizhi/updates/ \
  --notes clients/releases/<版本>.md \
  --privateKey "$HOME/.local/share/yangyizhi/signing/update-private.pem" \
  --previous artifacts/current-updates/stable.json
node scripts/verify-update-feed.mjs artifacts/release-updates
deploy/publish-updates.sh <SSH_HOST_ALIAS> artifacts/release-updates
unset UPDATE_KEY_PASSPHRASE
```

首次发布不传 `--previous`。后续发布应传上一版 `stable.json` 及同目录哈希文件，脚本会验签、校验旧包并保留未变更平台的更新入口，再签发新清单。更新客户端下载目录必须与客户端 `manifestUrl` 一致；入口现为 `https://81.70.181.205/yangyizhi/updates/stable.json`。

不要用 `rsync --delete` 覆盖线上目录。保留最近发布目录由运维确认后清理，不在发布中自动删除。更新清单和安装包放到 SHA-256 命名目录，先传文件，再原子替换 `stable.json`；不可把 Actions 临时产物当唯一下载源。

## 账号/同步与备份

首版以与拾光相同的文件型工作区模型作为结构：单实例单 Node 进程、`workspace.json` 原子快照，不引入 SQL 或跨产品数据连接。此方案适用于 demo / 小规模试用，不作为高并发或多副本数据库方案。后续数据量、账号数或并发超出单文件边界时，先备份并设计迁移，再考虑独立 PostgreSQL；不得连接拾光数据库。

加密备份密钥需单独离线保存。每月抽样解密并恢复到隔离测试目录；正式恢复时先停服务、保留当前数据库副本、再原子恢复并检查健康。修改代码失败时只回滚 `current` 版本指针，不回滚账号数据。

### 当前尚需提供

- 首次配置更新发布通道时，在腾讯云 TAT 中以 root 从已合并的 `main` 下载 `deploy/provision-update-deployer.sh`、`deploy/yangyizhi-deploy-ssh` 和 `deploy/remote-updates-deploy.sh`，再把专用公钥作为脚本参数执行。该密钥只能写入更新暂存目录并调用固定的 root 更新脚本；不要授权通用 root SSH。
- GitHub Actions 正式发布需要 `TENCENT_SSH_TARGET`、`TENCENT_SSH_PRIVATE_KEY`、`TENCENT_SSH_KNOWN_HOSTS` 三项 Secrets。主机密钥指纹应通过腾讯云 TAT 上的 `/etc/ssh/ssh_host_ed25519_key.pub` 核对后固定。
- Tencent COS bucket/region/访问凭据仅在决定用 COS 做安装包分发时需要；首版可通过独立 CVM 下载目录发布。
- 稳定 Android 发布 keystore 和密码；Apple Developer ID/公证材料用于公众 macOS 分发。Windows 商业代码签名证书可后续补充。
- 更新清单 RSA 私钥需创建后备份到两处受控离线位置；公钥固定进客户端。不要把私钥、keystore 或凭据发在聊天或提交到仓库。
