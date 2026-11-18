package app.yangyizhi.mobile.updates;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.Base64;
import org.json.JSONObject;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "YangyizhiUpdates")
public class YangyizhiUpdatesPlugin extends Plugin {
    private static final int MAX_MANIFEST = 256 * 1024;
    private static final long MAX_APK = 200L * 1024 * 1024;
    private JSONObject config;

    private JSONObject config() throws Exception {
        if (config == null) {
            try (InputStream in = getContext().getAssets().open("update-config.json")) {
                config = new JSONObject(new String(readLimited(in, 16 * 1024), StandardCharsets.UTF_8));
            }
        }
        return config;
    }

    private static byte[] readLimited(InputStream input, long limit) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw new Exception("下载内容超出大小限制");
            out.write(buffer, 0, count);
        }
        return out.toByteArray();
    }

    private static byte[] getHttps(String address, long limit) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) throw new Exception("更新地址无效");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/json, application/octet-stream");
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new Exception("更新服务器暂时不可用（HTTP " + status + "）");
            if (connection.getContentLengthLong() > limit) throw new Exception("下载内容超出大小限制");
            try (InputStream in = connection.getInputStream()) { return readLimited(in, limit); }
        } finally { connection.disconnect(); }
    }

    private JSONObject readPayload() throws Exception {
        JSONObject cfg = config();
        String manifestUrl = cfg.getString("manifestUrl");
        if (manifestUrl.contains(".invalid/") || cfg.optString("publicKey", "").startsWith("REPLACE")) throw new Exception("更新服务还没有配置。当前版本可以正常使用。");
        byte[] envelopeBytes = getHttps(manifestUrl, MAX_MANIFEST);
        JSONObject envelope = new JSONObject(new String(envelopeBytes, StandardCharsets.UTF_8));
        byte[] payloadBytes = Base64.getDecoder().decode(envelope.getString("payload"));
        String publicKey = cfg.getString("publicKey").replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
        byte[] keyBytes = Base64.getDecoder().decode(publicKey);
        java.security.PublicKey key = java.security.KeyFactory.getInstance("RSA").generatePublic(new java.security.spec.X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(key); verifier.update(payloadBytes);
        if (!verifier.verify(Base64.getDecoder().decode(envelope.getString("signature")))) throw new Exception("更新清单签名校验失败");
        JSONObject payload = new JSONObject(new String(payloadBytes, StandardCharsets.UTF_8));
        if (payload.getInt("protocol") != cfg.getInt("protocol") || !"stable".equals(payload.getString("channel"))) throw new Exception("更新协议不兼容");
        return payload;
    }

    private JSONObject releaseItem(JSONObject payload) throws Exception {
        JSONObject clients = payload.getJSONObject("clients");
        JSONObject item;
        if (Build.VERSION.SDK_INT < 29) throw new Exception("Android 10 或更新版本才支持客户端更新");
        item = clients.getJSONObject("android");
        PackageInfo current = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        long code = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
        long newCode = item.getLong("versionCode");
        if (compareVersion(current.versionName, item.getString("minimumCompatible")) < 0) throw new Exception("当前客户端版本过低，请先安装新版客户端");
        if (newCode <= code) return null;
        return item;
    }

    private static int compareVersion(String a, String b) throws Exception {
        if (!a.matches("\\d+\\.\\d+\\.\\d+") || !b.matches("\\d+\\.\\d+\\.\\d+")) throw new Exception("客户端版本信息无效");
        String[] left = a.split("\\."), right = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int x = Integer.parseInt(left[i]), y = Integer.parseInt(right[i]);
            if (x != y) return Integer.compare(x, y);
        }
        return 0;
    }

    private String currentCertificate() throws Exception {
        PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        byte[] cert = info.signingInfo.getApkContentsSigners()[0].toByteArray();
        return hex(MessageDigest.getInstance("SHA-256").digest(cert));
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte value : bytes) out.append(String.format("%02x", value));
        return out.toString();
    }

    private JSObject check() throws Exception {
        PackageInfo current = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
        JSObject result = new JSObject();
        result.put("currentVersion", current.versionName);
        JSONObject cfg = config();
        String manifestUrl = cfg.optString("manifestUrl", "");
        if (manifestUrl.contains(".invalid/") || cfg.optString("publicKey", "").startsWith("REPLACE")) {
            result.put("available", false);
            result.put("message", "更新服务还没有配置。当前版本可以正常使用。");
            return result;
        }
        JSONObject payload = readPayload();
        JSONObject item = releaseItem(payload);
        result.put("available", item != null);
        if (item != null) {
            result.put("version", item.getString("version")); result.put("versionCode", item.getLong("versionCode"));
            result.put("minimumCompatible", item.getString("minimumCompatible")); result.put("releaseNotes", item.getString("releaseNotes"));
            result.put("bytes", item.getLong("bytes")); result.put("sha256", item.getString("sha256"));
        } else result.put("message", "已是最新版本");
        return result;
    }

    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        getBridge().execute(() -> {
            try { call.resolve(check()); }
            catch (Exception error) { call.reject(error.getMessage() == null ? "更新检查失败，请稍后重试" : error.getMessage()); }
        });
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        getBridge().execute(() -> {
            try {
                JSONObject item = releaseItem(readPayload());
                if (item == null) throw new Exception("当前没有可用的客户端更新");
                if (!item.getString("sha256").matches("[a-f0-9]{64}") || item.getLong("bytes") < 1 || item.getLong("bytes") > MAX_APK) throw new Exception("APK 元数据无效");
                if (!currentCertificate().equals(item.getString("certificate"))) throw new Exception("此更新由不同的发布证书签名，已取消安装");
                File dir = new File(getContext().getFilesDir(), "verified-updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法准备更新目录");
                File apk = new File(dir, "yangyizhi-" + item.getLong("versionCode") + ".apk");
                URL manifest = new URL(config().getString("manifestUrl")), download = new URL(item.getString("url"));
                if (!"https".equals(download.getProtocol()) || !manifest.getHost().equalsIgnoreCase(download.getHost()) || manifest.getPort() != download.getPort()) throw new Exception("APK 下载来源与更新清单不一致");
                byte[] bytes = getHttps(item.getString("url"), MAX_APK);
                String sha = hex(MessageDigest.getInstance("SHA-256").digest(bytes));
                if (bytes.length != item.getLong("bytes") || !sha.equals(item.getString("sha256"))) throw new Exception("APK 校验失败，未打开安装器");
                Files.write(apk.toPath(), bytes);
                PackageInfo candidate = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
                if (candidate == null || !getContext().getPackageName().equals(candidate.packageName) || candidate.getLongVersionCode() != item.getLong("versionCode")
                    || !item.getString("version").equals(candidate.versionName)) throw new Exception("APK 应用 ID 或版本信息不匹配");
                String candidateCert = hex(MessageDigest.getInstance("SHA-256").digest(candidate.signingInfo.getApkContentsSigners()[0].toByteArray()));
                if (!candidateCert.equals(item.getString("certificate"))) throw new Exception("APK 发布签名不匹配");
                if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                    Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                    call.resolve(new JSObject().put("ok", false).put("permissionRequired", true));
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve(new JSObject().put("ok", true).put("version", item.getString("version")));
            } catch (Exception error) { call.reject(error.getMessage() == null ? "下载或安装更新失败" : error.getMessage()); }
        });
    }
}
