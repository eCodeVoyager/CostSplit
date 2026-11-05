package app.costsplit;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;

import java.io.File;

/**
 * Live updates of the app's web part (HTML/JS/CSS) without reinstalling the APK.
 *
 * A new version is unpacked to files/bundles/<version> and Capacitor is told to
 * serve the app from there (its "serverBasePath", kept in CapWebViewSettings).
 * Until the new version reports that it started fine (confirm), it's "pending":
 * a version that doesn't confirm is rolled back to the previous one, on the
 * next start at the latest, so a broken update can never lock anyone out.
 * Installing a new APK drops all of this and starts from the APK's own files.
 */
final class LiveUpdates {
    static final String PREFS = "CostSplitLiveUpdates";
    /** Capacitor's own settings (com.getcapacitor.plugin.WebView) */
    static final String CAP_PREFS = "CapWebViewSettings";
    static final String CAP_PATH = "serverBasePath";

    static final String BINARY = "binary";
    static final String CURRENT = "current";
    static final String CURRENT_PATH = "currentPath";
    static final String PENDING = "pending";
    static final String PENDING_PATH = "pendingPath";
    static final String TRIES = "tries";
    static final String BAD = "bad";

    private static boolean checked = false;

    private LiveUpdates() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File bundlesDir(Context c) {
        return new File(c.getFilesDir(), "bundles");
    }

    static long binaryVersion(Context c) {
        try {
            PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return info.lastUpdateTime;
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Runs before the WebView starts (MainActivity). A version that was given a
     * start and never confirmed is rolled back. A newly installed APK wipes
     * every downloaded version (Capacitor ignores the old path for it too).
     */
    static void beforeStart(Context c) {
        // Once per process: an activity re-created (rotation, dark mode) is not a new start
        if (checked) return;
        checked = true;
        SharedPreferences p = prefs(c);
        long binary = binaryVersion(c);
        if (p.getLong(BINARY, -1) != binary) {
            deleteRecursively(bundlesDir(c));
            p.edit().clear().putLong(BINARY, binary).commit();
            c.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, "").commit();
            return;
        }
        if (p.getString(PENDING, null) == null) return;
        if (p.getInt(TRIES, 0) >= 1) rollback(c);
        else p.edit().putInt(TRIES, 1).commit();
    }

    /** Use `path` from now on (next start; the plugin reloads right away when asked) */
    static void setPending(Context c, String version, String path, boolean startingNow) {
        prefs(c).edit()
            .putString(PENDING, version)
            .putString(PENDING_PATH, path)
            .putInt(TRIES, startingNow ? 1 : 0)
            .commit();
        c.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, path).commit();
    }

    /** The pending version started fine: keep it, drop older downloads */
    static String confirm(Context c) {
        SharedPreferences p = prefs(c);
        String pending = p.getString(PENDING, null);
        if (pending != null) {
            String path = p.getString(PENDING_PATH, "");
            p.edit()
                .putString(CURRENT, pending)
                .putString(CURRENT_PATH, path)
                .remove(PENDING)
                .remove(PENDING_PATH)
                .remove(TRIES)
                .commit();
        }
        String keep = p.getString(CURRENT_PATH, "");
        File[] all = bundlesDir(c).listFiles();
        if (all != null) {
            for (File f : all) {
                if (!f.getAbsolutePath().equals(keep)) deleteRecursively(f);
            }
        }
        return p.getString(CURRENT, "");
    }

    /** Back to the last version that worked ("" = the APK's own files). Returns that path. */
    static String rollback(Context c) {
        SharedPreferences p = prefs(c);
        String pending = p.getString(PENDING, null);
        String pendingPath = p.getString(PENDING_PATH, "");
        String previous = p.getString(CURRENT_PATH, "");
        if (!previous.isEmpty() && !new File(previous, "index.html").exists()) previous = "";
        c.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, previous).commit();
        SharedPreferences.Editor e = p.edit().remove(PENDING).remove(PENDING_PATH).remove(TRIES);
        if (pending != null) e.putString(BAD, pending);
        e.commit();
        if (!pendingPath.isEmpty() && !pendingPath.equals(previous)) deleteRecursively(new File(pendingPath));
        return previous;
    }

    static void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
