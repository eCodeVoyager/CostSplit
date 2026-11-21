package app.costsplit;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Prayer tab's link to the phone: takes the settings, reports whether
 * anything could stop the azan (notifications, exact alarms, battery
 * restrictions, the phone maker's own auto-start screen, volume), opens the
 * right settings screen to fix it, and plays or tests the azan.
 */
@CapacitorPlugin(name = "Adhan")
public class AdhanPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * Phone makers' own "auto start" / "background" screens (they stop alarms of
     * apps not allowed there). Tried in order; the first that exists opens.
     */
    private static final String[][] AUTOSTART = {
        { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
        { "com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity" },
        { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity" },
        { "com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity" },
        { "com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity" },
        { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
        { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
    };

    @Override
    public void load() {
        AdhanNotify.ensureChannels(getContext());
    }

    private Intent autostartIntent() {
        for (String[] target : AUTOSTART) {
            Intent intent = new Intent().setComponent(new ComponentName(target[0], target[1]));
            if (intent.resolveActivity(getContext().getPackageManager()) != null) return intent;
        }
        return null;
    }

    private JSObject status() {
        Context c = getContext();
        SharedPreferences p = AdhanConfig.prefs(c);
        JSONObject cfg = AdhanConfig.load(c);
        JSObject s = new JSObject();
        s.put("enabled", cfg != null && cfg.optBoolean("enabled", false));
        long nextAt = p.getLong(AdhanScheduler.NEXT_AT, 0);
        if (nextAt > 0) {
            JSObject next = new JSObject();
            next.put("at", nextAt);
            next.put("prayer", p.getString(AdhanScheduler.NEXT_PRAYER, ""));
            next.put("kind", p.getString(AdhanScheduler.NEXT_KIND, ""));
            s.put("next", next);
        } else {
            s.put("next", JSONObject.NULL);
        }
        s.put("reason", p.getString(AdhanScheduler.REASON, ""));
        s.put("place", p.getString(AdhanScheduler.PLACE, ""));
        s.put("playing", AdhanService.playing);
        long lastAt = p.getLong(AdhanService.LAST_PLAYED_AT, 0);
        if (lastAt > 0) {
            JSObject last = new JSObject();
            last.put("at", lastAt);
            last.put("prayer", p.getString(AdhanService.LAST_PLAYED, ""));
            s.put("lastPlayed", last);
        } else {
            s.put("lastPlayed", JSONObject.NULL);
        }

        s.put("notifications", AdhanNotify.allowed(c));
        boolean channel = true;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = nm.getNotificationChannel(AdhanNotify.CHANNEL_ADHAN);
            channel = ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        s.put("channel", channel);
        s.put("exactAlarms", AdhanScheduler.canExact(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        s.put("batteryUnrestricted", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        s.put("autostartScreen", autostartIntent() != null);
        s.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        AudioManager audio = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (audio != null) {
            s.put("alarmVolume", percent(audio, AudioManager.STREAM_ALARM));
            s.put("mediaVolume", percent(audio, AudioManager.STREAM_MUSIC));
            s.put("bluetooth", AdhanService.bluetoothConnected(audio));
        }
        s.put("dnd", nm != null && nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL);
        s.put("customSound", AdhanService.Sound.customFile(c, "custom").exists());
        s.put("customFajrSound", AdhanService.Sound.customFile(c, "custom_fajr").exists());
        s.put("sdk", Build.VERSION.SDK_INT);
        return s;
    }

    private static int percent(AudioManager audio, int stream) {
        int max = audio.getStreamMaxVolume(stream);
        return max <= 0 ? 0 : Math.round(audio.getStreamVolume(stream) * 100f / max);
    }

    /** New settings from the app: saved on the phone, next alarm set straight away */
    @PluginMethod
    public void configure(PluginCall call) {
        String json = call.getString("config");
        try {
            new JSONObject(json == null ? "" : json);
        } catch (Exception e) {
            call.reject("Bad settings");
            return;
        }
        AdhanConfig.save(getContext(), json);
        AdhanScheduler.schedule(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void preview(PluginCall call) {
        AdhanService.start(getContext(), call.getString("prayer", "dhuhr"), System.currentTimeMillis(), true);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        AdhanService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void testSoon(PluginCall call) {
        int seconds = Math.max(10, Math.min(600, call.getInt("seconds", 60)));
        JSObject result = new JSObject();
        result.put("at", AdhanScheduler.scheduleTest(getContext(), System.currentTimeMillis() + seconds * 1000L));
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Context c = getContext();
        String pkg = c.getPackageName();
        Uri uri = Uri.parse("package:" + pkg);
        Intent intent;
        switch (call.getString("target", "app")) {
            case "battery": {
                PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(pkg);
                // One system dialog: "Let CostSplit always run in background?"
                intent = ignoring ? new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) : new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, uri);
                break;
            }
            case "exact":
                intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, uri) : null;
                break;
            case "notifications":
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "channel":
                intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                    .putExtra(Settings.EXTRA_CHANNEL_ID, AdhanNotify.CHANNEL_ADHAN);
                break;
            case "autostart":
                intent = autostartIntent();
                break;
            default:
                intent = null;
        }
        if (intent == null) intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
        JSObject result = new JSObject();
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(intent);
            result.put("opened", true);
        } catch (Exception e) {
            // Some phone makers' screens refuse outside callers: fall back to the app's info screen
            try {
                c.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                result.put("opened", true);
            } catch (Exception again) {
                result.put("opened", false);
            }
        }
        call.resolve(result);
    }

    private static boolean validSlot(String slot) {
        return "custom".equals(slot) || "custom_fajr".equals(slot);
    }

    /** Your own azan file: checked to be playable, then kept in the app's files */
    @PluginMethod
    public void saveSound(PluginCall call) {
        String slot = call.getString("slot", "");
        String data = call.getString("data", "");
        if (!validSlot(slot) || data == null || data.isEmpty()) {
            call.reject("No file");
            return;
        }
        executor.execute(() -> {
            File target = AdhanService.Sound.customFile(getContext(), slot);
            File tmp = new File(target.getParentFile(), slot + ".tmp");
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                File dir = target.getParentFile();
                if (dir != null && !dir.exists() && !dir.mkdirs()) throw new Exception("No space for the file");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(bytes);
                }
                MediaPlayer check = new MediaPlayer();
                int duration;
                try {
                    check.setDataSource(tmp.getAbsolutePath());
                    check.prepare();
                    duration = check.getDuration();
                } catch (Exception e) {
                    throw new Exception("This phone can't play that file. Try an MP3.");
                } finally {
                    check.release();
                }
                if (target.exists() && !target.delete()) throw new Exception("Couldn't replace the old file");
                if (!tmp.renameTo(target)) throw new Exception("Couldn't save the file");
                JSObject result = new JSObject();
                result.put("duration", duration);
                call.resolve(result);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Couldn't save the file");
            }
        });
    }

    @PluginMethod
    public void deleteSound(PluginCall call) {
        String slot = call.getString("slot", "");
        if (validSlot(slot)) {
            //noinspection ResultOfMethodCallIgnored
            AdhanService.Sound.customFile(getContext(), slot).delete();
        }
        call.resolve();
    }
}
