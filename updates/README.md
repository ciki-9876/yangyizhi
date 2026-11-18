# 更新与发布

`clients/versions.json` 是版本唯一来源：`web` 是界面版本，`windows`、`android.version`、`macos` 是原生客户端版本。Android `versionCode` 每次正式发布必须严格递增。界面升级不能改变原生版本；只有原生 API 或更新协议发生不兼容变化时，才提高对应的 `minimumCompatible`。

## 清单协议 v1

正式清单采用 RSA-3072 / SHA-256 签名信封：

```json
{
  "payload": "<base64 编码的 UTF-8 JSON>",
  "signature": "<payload 字节的 RSA-SHA256 签名>"
}
```

payload 包含：

- `protocol`、`channel`、`publishedAt`。
- `web.version`、`web.url`、`web.bytes`、`web.sha256`、`web.releaseNotes`。
- `clients.windows`、`clients.android`、`clients.macos.arm64` 和 `clients.macos.x64`。每个存在的客户端项都含 `version`、`url`、`bytes`、`sha256`、`minimumCompatible`、`releaseNotes`；Android 还含 `versionCode`。
- `artifacts` 使用不可变路径（文件摘要作为目录名）；`stable.json` 仅在全部文件上传并校验成功后原子替换。

客户端下载后必须核对清单签名、下载长度与 SHA-256，再交给系统安装器；原生安装器还会校验包名、版本号和平台签名。不可用、超时、离线或损坏清单均保留当前安装版本，并给出可理解的错误。Web 使用带版本号的静态发布目录，保留上一个版本供回退。

协议实现、签名密钥生成和发布前检查见 `scripts/`。私钥和 Android keystore 不在代码库。初始化正式签名材料前，先准备两处受控的离线备份；丢失更新私钥需通过原生客户端升级轮换公钥，丢失 Android 证书则无法覆盖升级现有安装。
