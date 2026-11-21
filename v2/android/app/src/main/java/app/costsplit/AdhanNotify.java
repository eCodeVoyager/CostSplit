package app.costsplit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Calendar;
import java.util.Date;

/** Notification channels and the notifications around the azan */
final class AdhanNotify {
    /** Shown while the azan plays (the sound itself comes from AdhanService, so the channel is silent) */
    static final String CHANNEL_ADHAN = "adhan";
    /** Prayers set to "notification only", sunrise, and the fallback when the azan can't play */
    static final String CHANNEL_ALERT = "prayer_alert";
    static final String CHANNEL_REMIND = "prayer_remind";

    static final int ID_PLAYING = 7001;
    private static final int ID_ALERT = 7100;
    private static final int ID_REMIND = 7200;

    private AdhanNotify() {}

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel adhan = new NotificationChannel(CHANNEL_ADHAN, "Azan", NotificationManager.IMPORTANCE_HIGH);
        adhan.setDescription("Shows while the azan plays, with Stop. The azan sound is set in the app's Prayer tab.");
        adhan.setSound(null, null);
        adhan.enableVibration(false);
        adhan.setShowBadge(false);
        adhan.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(adhan);

        NotificationChannel alert = new NotificationChannel(CHANNEL_ALERT, "Prayer times", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Prayers set to notification only, sunrise, and prayers whose azan couldn't play.");
        alert.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build()
        );
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);

        NotificationChannel remind = new NotificationChannel(CHANNEL_REMIND, "Before prayer", NotificationManager.IMPORTANCE_DEFAULT);
        remind.setDescription("A reminder some minutes before each prayer.");
        nm.createNotificationChannel(remind);
    }

    static String title(String prayer, long at) {
        switch (prayer) {
            case "fajr": return "Fajr";
            case "sunrise": return "Sunrise";
            case "dhuhr": {
                Calendar cal = Calendar.getInstance();
                cal.setTimeInMillis(at);
                return cal.get(Calendar.DAY_OF_WEEK) == Calendar.FRIDAY ? "Jumu'ah" : "Dhuhr";
            }
            case "asr": return "Asr";
            case "maghrib": return "Maghrib";
            case "isha": return "Isha";
            default: return "Azan test";
        }
    }

    static String time(Context c, long at) {
        return android.text.format.DateFormat.getTimeFormat(c).format(new Date(at));
    }

    /** Opens the app on the Prayer tab (main.tsx handles the /prayer link) */
    static PendingIntent openApp(Context c) {
        Intent intent = new Intent(c, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("https://app.costsplit/prayer"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 7, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean allowed(Context c) {
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    private static int index(String prayer) {
        for (int i = 0; i < AdhanCalc.NAMES.length; i++) if (AdhanCalc.NAMES[i].equals(prayer)) return i;
        return 9;
    }

    /**
     * "Time for Asr" as a normal notification (prayers on notification only,
     * sunrise, or when the azan couldn't play), or "Asr in 10 min" before it.
     */
    static void prayerAlert(Context c, String prayer, long prayerAt, int minutesBefore) {
        if (!allowed(c)) return;
        ensureChannels(c);
        boolean reminder = minutesBefore > 0;
        String name = title(prayer, prayerAt);
        String text = reminder
            ? name + " in " + minutesBefore + " min"
            : "sunrise".equals(prayer) ? "Sunrise · Fajr time has ended" : "Time for " + name;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, reminder ? CHANNEL_REMIND : CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_stat_adhan)
            .setContentTitle(text)
            .setContentText(name + " · " + time(c, prayerAt))
            .setCategory(reminder ? NotificationCompat.CATEGORY_REMINDER : NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(c))
            .setAutoCancel(true)
            .setTimeoutAfter(reminder ? 60 * 60_000L : 3 * 60 * 60_000L);
        try {
            NotificationManagerCompat.from(c).notify((reminder ? ID_REMIND : ID_ALERT) + index(prayer), b.build());
        } catch (SecurityException ignored) {
            // Notifications turned off in the meantime
        }
    }
}
