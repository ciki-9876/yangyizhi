package app.yangyizhi.mobile.cloud;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "YangyizhiCloud")
public final class YangyizhiCloudPlugin extends Plugin {
    private static final String ALIAS = "app.yangyizhi.mobile.cloud.v1";
    private static final byte[] AAD = ALIAS.getBytes(StandardCharsets.UTF_8);
    private static final int MAX_BODY = 5 * 1024 * 1024;
    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private final Object guard = new Object();
    private SharedPreferences preferences;
    private JSONObject session;
    private String apiBase;
    private long generation;

    @Override public void load() {
        preferences = getContext().getSharedPreferences("yangyizhi_cloud_private", Context.MODE_PRIVATE);
        try { session = readSession(); } catch (Exception ignored) { session = null; }
        try (InputStream in = getContext().getAssets().open("cloud-config.json")) {
            JSONObject config = new JSONObject(new String(readLimited(in, 16 * 1024), StandardCharsets.UTF_8));
            apiBase = config.optString("nativeApiBaseUrl", "");
        } catch (Exception ignored) { apiBase = ""; }
    }

    private static byte[] readLimited(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = in.read(buffer)) != -1) { if (out.size() + count > max) throw new Exception("响应内容过大"); out.write(buffer, 0, count); }
        return out.toByteArray();
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore"); keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) keyStore.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private JSONObject readSession() throws Exception {
        String stored = preferences.getString("session", null); if (stored == null) return null;
        byte[] packed = Base64.decode(stored, Base64.NO_WRAP); if (packed.length < 13 || packed.length > 8192) throw new Exception("Invalid session");
        byte[] iv = new byte[12], encrypted = new byte[packed.length - 12]; System.arraycopy(packed, 0, iv, 0, 12); System.arraycopy(packed, 12, encrypted, 0, encrypted.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv)); cipher.updateAAD(AAD);
        return validateSession(new JSONObject(new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)));
    }

    private void writeSession(JSONObject value) throws Exception {
        if (value == null) { if (!preferences.edit().remove("session").commit()) throw new Exception("无法清除本机账号状态"); return; }
        JSONObject clean = validateSession(value); byte[] iv = new byte[12]; new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv)); cipher.updateAAD(AAD);
        byte[] encrypted = cipher.doFinal(clean.toString().getBytes(StandardCharsets.UTF_8)); byte[] packed = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, packed, 0, iv.length); System.arraycopy(encrypted, 0, packed, iv.length, encrypted.length);
        if (!preferences.edit().putString("session", Base64.encodeToString(packed, Base64.NO_WRAP)).commit()) throw new Exception("无法保存本机账号状态");
    }

    private JSONObject validateSession(JSONObject value) throws Exception {
        String token = value.getString("token"); JSONObject user = value.getJSONObject("user");
        if (!token.matches("[A-Za-z0-9_-]{32,128}") || !user.getString("id").matches("[0-9a-fA-F-]{36}") || user.getString("username").length() > 32) throw new Exception("Invalid session");
        JSONObject result = new JSONObject(); result.put("token", token); result.put("user", new JSONObject().put("id", user.getString("id")).put("username", user.getString("username"))); return result;
    }

    private boolean allowed(String path, String method) {
        if (path == null || method == null || path.contains("..") || path.contains("#") || path.contains("%") || path.contains("\\")) return false;
        return (path.equals("health") && method.equals("GET")) || (path.equals("account") && method.equals("GET")) || (path.equals("account/delete") && method.equals("POST")) ||
            (path.matches("workspace(?:\\?since=\\d{1,15})?") && (method.equals("GET") || method.equals("PUT"))) ||
            ((path.equals("auth/login") || path.equals("auth/register") || path.equals("auth/logout")) && method.equals("POST"));
    }

    private JSONObject request(String path, String method, JSONObject body, String token) throws Exception {
        if (apiBase == null || !apiBase.matches("https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/[A-Za-z0-9._~/-]+/") || !allowed(path, method)) throw new Exception("云同步服务尚未配置或请求无效。");
        URL base = new URL(apiBase); URL url = new URL(base, path);
        if (!"https".equals(url.getProtocol()) || !url.getHost().equals(base.getHost()) || url.getPort() != base.getPort() || !url.getPath().startsWith(base.getPath())) throw new Exception("云端地址无效。");
        byte[] bytes = body == null ? new byte[0] : body.toString().getBytes(StandardCharsets.UTF_8); if (bytes.length > MAX_BODY) throw new Exception("存档超过 5 MB 限制。");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestMethod(method); connection.setRequestProperty("Accept", "application/json"); connection.setUseCaches(false);
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) { connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json; charset=utf-8"); connection.getOutputStream().write(bytes); }
        try {
            int status = connection.getResponseCode(); InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] response = input == null ? new byte[0] : readLimited(input, MAX_BODY + 16 * 1024);
            JSONObject data = response.length == 0 ? new JSONObject() : new JSONObject(new String(response, StandardCharsets.UTF_8));
            return new JSONObject().put("status", status).put("data", data);
        } finally { connection.disconnect(); }
    }

    private void resolve(PluginCall call, JSONObject response) throws Exception {
        JSONObject data = response.getJSONObject("data"); data.remove("token"); JSObject result = new JSObject(response.toString()); call.resolve(result);
    }

    @PluginMethod public void request(PluginCall call) {
        String path = call.getString("path"), method = call.getString("method"); JSONObject body = call.getData().optJSONObject("body");
        if (!allowed(path, method) || (call.getData().has("body") && body == null)) { call.reject("云端请求格式无效。"); return; }
        boolean auth = "auth/login".equals(path) || "auth/register".equals(path); JSONObject bound; long version;
        synchronized (guard) { bound = session; version = auth ? ++generation : generation; }
        if (!auth && !"health".equals(path) && bound == null) {
            try { resolve(call, new JSONObject().put("status", 401).put("data", new JSONObject().put("message", "请先登录养一只账号。"))); } catch (Exception e) { call.reject("本机登录状态无法读取。"); }
            return;
        }
        network.execute(() -> {
            try {
                String token = auth || "health".equals(path) ? null : bound.getString("token");
                JSONObject response = request(path, method, body, token); int status = response.getInt("status"); JSONObject data = response.getJSONObject("data");
                if (auth) {
                    synchronized (guard) {
                        if (version != generation) { call.reject("登录状态已变化，请重试。"); return; }
                        if (status >= 200 && status < 300) { JSONObject next = validateSession(data); writeSession(next); session = next; }
                        resolve(call, response);
                    }
                } else if ("health".equals(path)) resolve(call, response);
                else synchronized (guard) {
                    if (session != bound || generation != version) { call.reject("登录账号已变化，请重试。"); return; }
                    if (("auth/logout".equals(path) || "account/delete".equals(path)) && (status == 200 || status == 401)) { writeSession(null); session = null; generation++; }
                    if (status == 401) { writeSession(null); session = null; generation++; }
                    resolve(call, response);
                }
            } catch (Exception ignored) { call.reject("云端连接失败，本机存档仍保留，请稍后重试。"); }
        });
    }

    @Override protected void handleOnDestroy() { network.shutdownNow(); super.handleOnDestroy(); }
}
