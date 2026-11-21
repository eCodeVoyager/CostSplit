package app.costsplit;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;

/**
 * Keeps exactly one alarm set: the next azan, prayer notification or
 * reminder. When it fires, AdhanReceiver acts on it and calls schedule() again
 * for the one after. Boot, app updates, time and time zone changes do the same,
 * so the chain never breaks while the phone is on.
 *
 * Alarm-clock alarms (setAlarmClock) are the most reliable kind Android has:
 * exact, delivered in Doze, and allowed to start the foreground service that
 * plays the sound from the background. USE_EXACT_ALARM (Android 13+) means
 * there's no permission screen for it.
 */
final class AdhanScheduler {
    static final String ACTION_FIRE = "app.costsplit.adhan.FIRE";
    static final String NEXT_AT = "nextAt";
    static final String NEXT_PRAYER = "nextPrayer";
    static final String NEXT_KIND = "nextKind";
    static final String REASON = "reason";
    static final String PLACE = "place";
    static final String LAST_FIRED = "lastFired";

    private static final int REQUEST_NEXT = 1;
    private static final int REQUEST_SHOW = 2;
    private static final int REQUEST_TEST = 3;

    private AdhanScheduler() {}

    static final class Event implements Comparable<Event> {
        final long at;
        final String prayer;
        /** adhan, notify or remind */
        final String kind;

        Event(long at, String prayer, String kind) {
            this.at = at;
            this.prayer = prayer;
            this.kind = kind;
        }

        @Override
        public int compareTo(Event o) {
            return Long.compare(at, o.at);
        }
    }

    /** Everything planned from today for `days` days, earliest first */
    static List<Event> upcoming(JSONObject cfg, AdhanConfig.Place place, int days) {
        List<Event> out = new ArrayList<>();
        JSONObject prayers = cfg.optJSONObject("prayers");
        int remind = cfg.optInt("remindBefore", 0);
        boolean sunrise = cfg.optBoolean("sunrise", false);
        Calendar day = Calendar.getInstance();
        for (int i = 0; i < days; i++) {
            long[] t = AdhanCalc.times(day.get(Calendar.YEAR), day.get(Calendar.MONTH) + 1, day.get(Calendar.DAY_OF_MONTH), place.lat, place.lng, place.params);
            for (int p = 0; p < AdhanCalc.NAMES.length; p++) {
                if (t[p] == AdhanCalc.NONE) continue;
                String name = AdhanCalc.NAMES[p];
                if (p == AdhanCalc.SUNRISE) {
                    if (sunrise) out.add(new Event(t[p], name, "notify"));
                    continue;
                }
                String alert = prayers == null ? "adhan" : prayers.optString(name, "adhan");
                if ("off".equals(alert)) continue;
                out.add(new Event(t[p], name, "notify".equals(alert) ? "notify" : "adhan"));
                if (remind > 0) out.add(new Event(t[p] - remind * 60_000L, name, "remind"));
            }
            day.add(Calendar.DAY_OF_MONTH, 1);
        }
        Collections.sort(out);
        return out;
    }

    private static PendingIntent fireIntent(Context c, int request, Event e, boolean test) {
        Intent intent = new Intent(c, AdhanReceiver.class).setAction(ACTION_FIRE);
        if (e != null) {
            intent.putExtra("at", e.at).putExtra("prayer", e.prayer).putExtra("kind", e.kind).putExtra("test", test);
        }
        return PendingIntent.getBroadcast(c, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || (am != null && am.canScheduleExactAlarms());
    }

    private static void set(Context c, long at, PendingIntent fire, boolean alarmClock) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            if (canExact(c) && alarmClock) {
                Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                PendingIntent show = PendingIntent.getActivity(c, REQUEST_SHOW, open != null ? open : new Intent(), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fire);
            } else if (canExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            } else {
                // No exact alarms allowed: may come a few minutes late (the app warns about it)
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        }
    }

    /** Plan the next event from the saved settings (or cancel when the azan is off) */
    static synchronized void schedule(Context c) {
        SharedPreferences prefs = AdhanConfig.prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONObject cfg = AdhanConfig.load(c);
        AdhanConfig.Place place = cfg == null ? null : AdhanConfig.place(cfg);
        String reason = cfg == null || !cfg.optBoolean("enabled", false) ? "disabled" : place == null ? "no-location" : "";

        Event next = null;
        if (reason.isEmpty()) {
            long now = System.currentTimeMillis();
            long lastFired = prefs.getLong(LAST_FIRED, 0);
            for (Event e : upcoming(cfg, place, 3)) {
                if (e.at > now + 1000 && e.at > lastFired) {
                    next = e;
                    break;
                }
            }
            if (next == null) reason = "nothing-on";
        }

        SharedPreferences.Editor edit = prefs.edit().putString(REASON, reason).putString(PLACE, place == null ? "" : place.name);
        if (next == null) {
            if (am != null) am.cancel(fireIntent(c, REQUEST_NEXT, null, false));
            edit.remove(NEXT_AT).remove(NEXT_PRAYER).remove(NEXT_KIND).apply();
            return;
        }
        set(c, next.at, fireIntent(c, REQUEST_NEXT, next, false), cfg.optBoolean("alarmClock", true));
        edit.putLong(NEXT_AT, next.at).putString(NEXT_PRAYER, next.prayer).putString(NEXT_KIND, next.kind).apply();
    }

    /** A real azan in a little while, to check it plays with the app closed and the screen off */
    static long scheduleTest(Context c, long at) {
        JSONObject cfg = AdhanConfig.load(c);
        set(c, at, fireIntent(c, REQUEST_TEST, new Event(at, "test", "adhan"), true), cfg == null || cfg.optBoolean("alarmClock", true));
        return at;
    }
}
