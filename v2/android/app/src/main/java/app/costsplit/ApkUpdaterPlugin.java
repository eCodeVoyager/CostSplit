package app.costsplit;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.lifecycle.Lifecycle;

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
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Updates for an app installed outside the Play Store.
 *
 * Live updates (most releases): the new web part is downloaded as a zip, its
 * SHA-256 checked against version.json, unpacked, and the app switches to it.
 * No installer, no reinstall. See LiveUpdates for the rollback rules.
 *
 * APK updates (when the native part changed): the new APK is downloaded inside
 * the app, checked the same way and handed to Android's package installer. The
 * user confirms once; the app's data stays because the signing key is the same.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    /** How long a new version gets to say it started fine (while the app is on screen) */
    private static final long CONFIRM_WITHIN_MS = 20_000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        // A version on trial that doesn't confirm in time is rolled back right here
        if (LiveUpdates.prefs(getContext()).getString(LiveUpdates.PENDING, null) != null) watchPending();
    }

    private void watchPending() {
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (LiveUpdates.prefs(getContext()).getString(LiveUpdates.PENDING, null) == null) return;
                // Only count time on screen: a phone in a pocket may not run the page at all
                if (getActivity() == null || !getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                    main.postDelayed(this, CONFIRM_WITHIN_MS);
                    return;
                }
                String previous = LiveUpdates.rollback(getContext());
                if (previous.isEmpty()) bridge.setServerAssetPath(com.getcapacitor.Bridge.DEFAULT_WEB_ASSET_DIR);
                else bridge.setServerBasePath(previous);
            }
        }, CONFIRM_WITHIN_MS);
    }

    private boolean debuggable() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Debug builds talk to a laptop server over plain http; release builds only take https */
    private boolean allowedUrl(String url) {
        return url != null && (url.startsWith("https://") || (debuggable() && url.startsWith("http://")));
    }

    /** Installed app version and the live update state */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("versionName", info.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
        } catch (Exception e) {
            result.put("versionName", "");
        }
        SharedPreferences p = LiveUpdates.prefs(getContext());
        result.put("live", p.getString(LiveUpdates.CURRENT, ""));
        result.put("pending", p.getString(LiveUpdates.PENDING, ""));
        result.put("bad", p.getString(LiveUpdates.BAD, ""));
        call.resolve(result);
    }

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

    /** Downloads `url` to `dest`, reporting progress as `event`, and checks the SHA-256 */
    private void fetchTo(String url, File dest, String expected, String event) throws Exception {
        File dir = dest.getParentFile();
        if (dir != null && !dir.exists() && !dir.mkdirs()) throw new Exception("No space for the update");
        File tmp = new File(dir, dest.getName() + ".tmp");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
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
                            notifyListeners(event, progress);
                        }
                    }
                }
            }

            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            if (expected != null && !expected.isEmpty() && !expected.equalsIgnoreCase(hex.toString())) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                throw new Exception("The download was damaged. Try again.");
            }
            if (dest.exists() && !dest.delete()) throw new Exception("Couldn't save the update");
            if (!tmp.renameTo(dest)) throw new Exception("Couldn't save the update");
        } finally {
            conn.disconnect();
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256", "");
        if (!allowedUrl(url)) {
            call.reject("Updates must come over https");
            return;
        }
        executor.execute(() -> {
            try {
                File apk = new File(new File(getContext().getCacheDir(), "updates"), "costsplit-update.apk");
                fetchTo(url, apk, expected, "progress");
                JSObject result = new JSObject();
                result.put("path", apk.getAbsolutePath());
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
            }
        });
    }

    /** Live update: download the web part, check it, unpack it next to the others. Returns its folder. */
    @PluginMethod
    public void downloadBundle(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256", "");
        String version = call.getString("version", "");
        if (!allowedUrl(url)) {
            call.reject("Updates must come over https");
            return;
        }
        if (version == null || !version.matches("[0-9]+(\\.[0-9]+){1,3}")) {
            call.reject("Invalid version");
            return;
        }
        if (expected == null || !expected.matches("[0-9a-fA-F]{64}")) {
            call.reject("Missing checksum");
            return;
        }
        executor.execute(() -> {
            File zip = new File(new File(getContext().getCacheDir(), "updates"), "bundle.zip");
            File root = LiveUpdates.bundlesDir(getContext());
            File target = new File(root, version);
            File staging = new File(root, version + ".tmp");
            try {
                fetchTo(url, zip, expected, "bundleProgress");
                LiveUpdates.deleteRecursively(staging);
                if (!staging.mkdirs()) throw new Exception("No space for the update");
                unzip(zip, staging);
                if (!new File(staging, "index.html").exists()) throw new Exception("The update is incomplete");
                // Never replace the folder the app is running from
                String running = bridge.getServerBasePath();
                if (target.exists() && !target.getAbsolutePath().equals(running)) LiveUpdates.deleteRecursively(target);
                if (!target.exists() && !staging.renameTo(target)) throw new Exception("Couldn't save the update");
                LiveUpdates.deleteRecursively(staging);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                call.resolve(result);
            } catch (Exception e) {
                LiveUpdates.deleteRecursively(staging);
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
            } finally {
                //noinspection ResultOfMethodCallIgnored
                zip.delete();
            }
        });
    }

    private static void unzip(File zip, File dir) throws Exception {
        String root = dir.getCanonicalPath() + File.separator;
        byte[] buffer = new byte[64 * 1024];
        try (ZipInputStream in = new ZipInputStream(new java.io.FileInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                File out = new File(dir, entry.getName());
                // No "../" tricks: everything stays inside the folder
                if (!out.getCanonicalPath().startsWith(root)) throw new Exception("Bad file in the update");
                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) throw new Exception("No space for the update");
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new Exception("No space for the update");
                try (FileOutputStream os = new FileOutputStream(out)) {
                    int read;
                    while ((read = in.read(buffer)) != -1) os.write(buffer, 0, read);
                }
            }
        }
    }

    /**
     * Switch to a downloaded version. `now`: reload straight away; otherwise it
     * starts the next time the app opens.
     */
    @PluginMethod
    public void applyBundle(PluginCall call) {
        String path = call.getString("path", "");
        String version = call.getString("version", "");
        boolean now = Boolean.TRUE.equals(call.getBoolean("now", false));
        File dir = path == null ? null : new File(path);
        String root;
        try {
            root = LiveUpdates.bundlesDir(getContext()).getCanonicalPath() + File.separator;
            if (dir == null || !dir.getCanonicalPath().startsWith(root) || !new File(dir, "index.html").exists()) {
                call.reject("Download the update first");
                return;
            }
        } catch (Exception e) {
            call.reject("Download the update first");
            return;
        }
        LiveUpdates.setPending(getContext(), version, dir.getAbsolutePath(), now);
        call.resolve();
        if (now) {
            bridge.setServerBasePath(dir.getAbsolutePath());
            watchPending();
        }
    }

    /** Called by the app once it has started: a version on trial is kept */
    @PluginMethod
    public void confirmBundle(PluginCall call) {
        JSObject result = new JSObject();
        result.put("live", LiveUpdates.confirm(getContext()));
        call.resolve(result);
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
