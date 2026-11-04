package app.costsplit;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app updates for an APK installed outside the Play Store: downloads the new
 * APK inside the app (with progress), checks its SHA-256 against version.json,
 * then hands it to Android's package installer. The user confirms once in the
 * system dialog; the app's data stays because the signing key is the same.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /** Android 8+ asks the user once to allow CostSplit to install updates */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256", "");
        // Debug builds talk to a laptop server over plain http; release builds only take https
        boolean debuggable = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (url == null || !(url.startsWith("https://") || (debuggable && url.startsWith("http://")))) {
            call.reject("Updates must come over https");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("No space for the update");
                File tmp = new File(dir, "download.tmp");
                File apk = new File(dir, "costsplit-update.apk");

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                int status = conn.getResponseCode();
                if (status != 200) throw new Exception("Download failed (" + status + ")");
                long total = conn.getContentLengthLong();

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    int read;
                    int last = -1;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        done += read;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != last) {
                                last = percent;
                                JSObject progress = new JSObject();
                                progress.put("percent", percent);
                                notifyListeners("progress", progress);
                            }
                        }
                    }
                }

                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format("%02x", b));
                if (!expected.isEmpty() && !expected.equalsIgnoreCase(hex.toString())) {
                    tmp.delete();
                    throw new Exception("The download was damaged. Try again.");
                }
                if (apk.exists()) apk.delete();
                if (!tmp.renameTo(apk)) throw new Exception("Couldn't save the update");

                JSObject result = new JSObject();
                result.put("path", apk.getAbsolutePath());
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        File apk = path == null ? null : new File(path);
        if (apk == null || !apk.exists()) {
            call.reject("Download the update first");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Couldn't open the installer");
        }
    }
}
