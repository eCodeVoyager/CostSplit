package app.costsplit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The azan alarm went off, or something happened that moves prayer times
 * (reboot, app update, clock or time zone change, exact alarms allowed):
 * act on it and set the next alarm.
 */
public class AdhanReceiver extends BroadcastReceiver {
    /** Played this late at most (phone was off, inexact alarm): later than that would be the wrong time */
    private static final long LATE_LIMIT_MS = 10 * 60_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (AdhanScheduler.ACTION_FIRE.equals(intent.getAction())) {
            long at = intent.getLongExtra("at", 0);
            String prayer = intent.getStringExtra("prayer");
            String kind = intent.getStringExtra("kind");
            boolean test = intent.getBooleanExtra("test", false);
            long late = System.currentTimeMillis() - at;
            if (!test) AdhanConfig.prefs(context).edit().putLong(AdhanScheduler.LAST_FIRED, at).apply();
            if (prayer != null && late < LATE_LIMIT_MS && late > -2 * 60_000L) {
                if ("adhan".equals(kind)) {
                    AdhanService.start(context, prayer, at, test);
                } else if ("remind".equals(kind)) {
                    org.json.JSONObject cfg = AdhanConfig.load(context);
                    int before = cfg == null ? 0 : cfg.optInt("remindBefore", 0);
                    if (before > 0) AdhanNotify.prayerAlert(context, prayer, at + before * 60_000L, before);
                } else {
                    AdhanNotify.prayerAlert(context, prayer, at, 0);
                }
            }
            if (!test) AdhanScheduler.schedule(context);
            return;
        }
        AdhanScheduler.schedule(context);
    }
}
