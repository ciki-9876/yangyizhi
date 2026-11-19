# 多端构建与更新

## 版本分离

`clients/versions.json` 是单一版本源。界面版本 `web` 与 Windows、Android、macOS 原生版本独立推进；Android 另用单调递增的 `versionCode`。Web 构建写出 `dist/version.json`，Android Gradle 和 Electron 从同一文件取对应客户端版本。更新协议 `updateProtocol` 只在客户端和服务端协议不兼容时递增。

Android CI 只安装构建所需的 API 36 平台和 Build Tools 36，并使用仓库中已人工接受的 `android-sdk-license` 标记；不接受与产品无关的 TV / XR 等 SDK 附加许可。新增或更新 SDK 许可时，先由项目负责人在 Android SDK Manager 审阅并接受，再更新对应的许可标记。

## 当前构建

```sh
npm ci
npm test
npm run build:web
node scripts/set-desktop-version.mjs windows
npm run check:versions
python scripts/archive-web.py
npm ci --prefix clients/windows
npm run dist --prefix clients/windows
npm run android:sync
cd clients/android && ./gradlew assembleDebug
```

Windows NSIS 安装包由 Windows Actions runner 构建；macOS DMG / ZIP 在 macOS runner 构建。常规 Android CI 只生成 debug APK；只有从 `main` 手动运行正式发布工作流时才读取签名 Secrets 并构建 release APK 与 AAB。debug APK 和 release APK 签名不同，不能互相覆盖升级。正式 Android 证书不可重建或替换，须长期离线备份。

## 客户端更新

Windows / macOS 桌面客户端与 Android 通过设置页查询同一 RSA-SHA256 签名清单。客户端限制 HTTPS 下载源，不允许重定向；检查协议、平台、最低兼容版本、版本、大小和 SHA-256。Windows / macOS 在用户选择路径写入完整校验通过的安装包；打开前会再次校验文件。Android 10+ 另核对包名、版本号与 APK 证书指纹，再交给 Android 系统安装器。网络或签名校验失败会显示错误并继续运行当前客户端。桌面端更新采用“下载已校验安装包，由用户启动安装器”的流程；macOS 用户解压签名清单里的 ZIP，将新应用复制到可写 Applications 目录。替换前应退出旧应用并保留一份旧应用副本；签名清单同时提供 DMG 安装下载入口。

清单及 Web 压缩包/原生安装包由 `scripts/release-manifest.mjs` 生成，必须由 `scripts/init-signing.sh` 创建的长期 RSA 私钥签名。公开密钥固定于客户端配置；只允许可信 HTTPS 更新源。Web 应用通过腾讯云服务滚动热更新；安装包路径带内容 SHA-256，先发布内容寻址文件，最后原子切换稳定清单。`deploy/publish-updates.sh` 发布前验证签名与每个包的摘要。

## Android 首次签名发布到腾讯云

正式客户端固定读取 `https://81.70.181.205/yangyizhi/updates/stable.json`。GitHub Pages 仅作为静态网页预览，不提供正式客户端更新源。`publish-android-updates.yml` 只允许从 `main` 手动运行；它构建正式签名 APK 与 Web 压缩包、生成 RSA-SHA256 清单、验签并上传至腾讯云，再检查部署后的清单。

正式发布前：

1. 核实没有可沿用的 Android keystore 或清单私钥。首次发布应从本机运行 `scripts/init-signing.sh`，生成长期密钥。当前这台 Mac 的私钥与 keystore 在 `~/.local/share/yangyizhi/signing/`，三个口令已存入 macOS Keychain 的 `yangyizhi.signing` 服务；请把签名目录加密备份到两处独立离线位置，并在密码管理器中备份这些口令。忘记密码或丢失 Android keystore 后，已安装应用无法正常覆盖升级；更换更新清单私钥则会让旧客户端拒绝后续清单。
2. 将 `update-private.pem` 的完整加密 PEM、更新私钥口令、`android-release.jks` 的 Base64 内容、keystore/key 口令和 alias 保存为 GitHub Repository Secrets：`UPDATE_PRIVATE_KEY_PEM`、`UPDATE_KEY_PASSPHRASE`、`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。不要在聊天、命令行参数、日志或仓库写入这些值。
3. 确认 `clients/update-config.json` 里的公开密钥由同一私钥生成，并确认 Android 版本与 `versionCode` 已按发布策略递增。首次正式签名包不能覆盖调试签名包；从调试包切换前，先在应用内“复制存档”并保存数据，再安装首个正式签名包。
4. 使用 `deploy/provision-update-deployer.sh` 在腾讯云主机建立专用部署账号。它只允许 GitHub Actions 上传更新包并调用固定的更新发布程序；SSH key 禁止端口转发、Agent 转发、X11 和交互终端。将对应 `user@host`、私钥和固定的 `known_hosts` 条目写入 `TENCENT_SSH_TARGET`、`TENCENT_SSH_PRIVATE_KEY`、`TENCENT_SSH_KNOWN_HOSTS` 三个 GitHub Secrets。合并并部署包含真实公开密钥的客户端后，在 GitHub Actions 手动运行 **Publish signed Android update feed**，填写面向用户的发布说明。工作流会验证包名、APK 签名证书和更新清单，再部署到腾讯云；Actions 日志不会输出私钥或口令。

首次运行只发布 Android 与 Web 更新项；后续清单会保留已发布 Windows/macOS 更新项及其校验过的下载文件。腾讯云更新目录按 SHA-256 内容寻址，并在安装包上传完成后才切换稳定清单。AAB 作为 5 天 Actions 中转产物下载后提交应用商店，不作为应用内更新包。

## 正式发布签名

- Android: 使用专用且稳定的 `android-release.jks`，安全存放于本机 `~/.local/share/yangyizhi/signing/` 或受控 GitHub Secrets。CI 读入 Secrets 后只在 runner 临时目录落盘，构建后删除；不要上传 Actions artifact 或打印密码。商店 AAB 和直接下载 APK 使用同一 upload key。
- Windows: 可先发布未 Authenticode 签名的测试包；公开分发建议购买代码签名证书并配置受保护 Secrets。
- macOS: 面向公众分发需 Developer ID 签名和 Apple 公证。桌面打包配置默认禁止自动挑选本机钥匙串的个人证书；配置受控的 Developer ID/公证 Secrets 后，由发布 runner 显式签名和公证。没有签名与公证的 CI DMG 仅供内部测试，Gatekeeper 可能拦截。Windows/macOS 安装包都在发布清单中列出 SHA-256。
- 更新清单 RSA 私钥与 Android keystore 是不同密钥。二者都不能进入仓库、安装包、日志或服务器；后端只保留已签名清单和公开文件。

`scripts/init-signing.sh` 是唯一生成入口，会拒绝覆盖已有密钥。执行后先离线备份整个 signing 目录两份，再配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 等 GitHub Secrets。清单生成时从 `android-signing-report.json` 设置 `ANDROID_CERT_SHA256`，不能使用 debug APK 的证书。

不要把 Actions artifact 当正式下载站：artifact 默认只保留 5 天，适合作为 CI 中转。经人工检查正式包与 SHA-256 后，使用 `deploy/publish.sh` 将版本化网站和签名更新目录发布到新腾讯云站点。当前仓库没有旧版本 Android/Windows 包，也没有签名材料，因此首次正式 OTA 要等正式包和密钥准备后启动。
