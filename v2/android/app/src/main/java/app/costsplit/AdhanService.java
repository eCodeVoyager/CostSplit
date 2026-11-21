package app.costsplit;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.File;

/**
 * Plays the azan as a foreground service (type mediaPlayback), so it keeps
 * going with the screen off and the app closed, and shows a notification
 * with Stop.
 *
 * Where it plays: the alarm stream (loud, plays on silent and through Do Not
 * Disturb) or the media stream (follows a Bluetooth speaker or headphones).
 * "auto" picks media when a Bluetooth output is connected, alarm otherwise.
 * The chosen stream's volume is raised for the azan and put back afterwards.
 *
 * Stops on: Stop in the notification, swiping it away, a volume button (if
 * on), a phone call, or the end of the recording. Never starts during a call.
 */
public class AdhanService extends Service implements AudioManager.OnAudioFocusChangeListener {
    static final String ACTION_PLAY = "app.costsplit.adhan.PLAY";
    static final String ACTION_STOP = "app.costsplit.adhan.STOP";
    static final String LAST_PLAYED_AT = "lastPlayedAt";
    static final String LAST_PLAYED = "lastPlayed";

    /** Longest any azan may play (a long custom file is cut here) */
    private static final long MAX_PLAY_MS = 8 * 60_000L;
    private static final long FADE_IN_MS = 8_000L;

    /** The prayer playing right now ("" when quiet), for the app's Play/Stop button */
    static volatile String playing = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private LoudnessEnhancer enhancer;
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    private BroadcastReceiver volumeReceiver;
    private int stream = -1;
    private int savedVolume = -1;
    private int setVolume = -1;
    private long ignoreVolumeUntil;
    private String prayer = "";
    private long prayerAt;
    private boolean test;
    /** The recording actually started (not stopped while loading) */
    private boolean started;

    /** Start playing (from the alarm, or "Play now" in the app) */
    static void start(Context c, String prayer, long at, boolean test) {
        Intent intent = new Intent(c, AdhanService.class)
            .setAction(ACTION_PLAY)
            .putExtra("prayer", prayer)
            .putExtra("at", at)
            .putExtra("test", test);
        try {
            ContextCompat.startForegroundService(c, intent);
        } catch (Exception e) {
            // Android refused a foreground service from the background: at least notify, with sound
            AdhanNotify.prayerAlert(c, prayer, at, 0);
        }
    }

    static void stop(Context c) {
        if (playing.isEmpty()) return;
        try {
            c.startService(new Intent(c, AdhanService.class).setAction(ACTION_STOP));
        } catch (Exception ignored) {
            // Not running
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (!ACTION_PLAY.equals(action)) {
            // Stop (Android never restarts us on its own: START_NOT_STICKY)
            finish(true);
            return START_NOT_STICKY;
        }
        // A new azan replaces one still playing (the volume it changed goes back first)
        quiet(false);
        prayer = intent.getStringExtra("prayer");
        if (prayer == null) prayer = "dhuhr";
        prayerAt = intent.getLongExtra("at", System.currentTimeMillis());
        test = intent.getBooleanExtra("test", false);
        started = false;
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        // Within seconds of startForegroundService(), before anything that could fail
        startInForeground(playingNotification(prayer, prayerAt));
        playing = prayer;

        if (inCall()) {
            // Never blare over a phone call: a normal notification instead
            AdhanNotify.prayerAlert(this, prayer, prayerAt, 0);
            finish(false);
            return START_NOT_STICKY;
        }
        try {
            play();
        } catch (Exception e) {
            AdhanNotify.prayerAlert(this, prayer, prayerAt, 0);
            finish(false);
        }
        return START_NOT_STICKY;
    }

    private void startInForeground(Notification n) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, AdhanNotify.ID_PLAYING, n, type);
    }

    private PendingIntent stopIntent() {
        Intent intent = new Intent(this, AdhanService.class).setAction(ACTION_STOP);
        return PendingIntent.getService(this, 8, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification playingNotification(String prayer, long at) {
        AdhanNotify.ensureChannels(this);
        String name = AdhanNotify.title(prayer, at);
        return new NotificationCompat.Builder(this, AdhanNotify.CHANNEL_ADHAN)
            .setSmallIcon(R.drawable.ic_stat_adhan)
            .setContentTitle(prayer.isEmpty() ? "Azan" : name + " · " + AdhanNotify.time(this, at))
            .setContentText(prayer.isEmpty() ? "" : "Azan is playing. Tap Stop or press a volume button.")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(AdhanNotify.openApp(this))
            .setDeleteIntent(stopIntent())
            .addAction(0, "Stop", stopIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private boolean inCall() {
        if (audio == null) return false;
        int mode = audio.getMode();
        return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE;
    }

    /** A Bluetooth speaker, headphones or car audio that media would play through */
    static boolean bluetoothConnected(AudioManager audio) {
        if (audio == null) return false;
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && (t == AudioDeviceInfo.TYPE_BLE_HEADSET || t == AudioDeviceInfo.TYPE_BLE_SPEAKER)) return true;
        }
        return false;
    }

    private void play() throws Exception {
        JSONObject cfg = AdhanConfig.load(this);
        if (cfg == null) cfg = new JSONObject();
        String output = cfg.optString("output", "auto");
        boolean media = "media".equals(output) || ("auto".equals(output) && bluetoothConnected(audio));
        stream = media ? AudioManager.STREAM_MUSIC : AudioManager.STREAM_ALARM;
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(media ? AudioAttributes.USAGE_MEDIA : AudioAttributes.USAGE_ALARM)
            .setContentType(media ? AudioAttributes.CONTENT_TYPE_MUSIC : AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        int volume = cfg.optInt("volume", 85);
        if (volume > 0) {
            try {
                int max = audio.getStreamMaxVolume(stream);
                savedVolume = audio.getStreamVolume(stream);
                setVolume = Math.max(1, Math.round(max * Math.min(100, volume) / 100f));
                ignoreVolumeUntil = SystemClock.uptimeMillis() + 1500;
                audio.setStreamVolume(stream, setVolume, 0);
            } catch (SecurityException e) {
                // Do Not Disturb rules on some phones: play at the current volume
                savedVolume = -1;
            }
        }
        requestFocus(attrs);

        Sound sound = Sound.pick(this, cfg, prayer);
        player = new MediaPlayer();
        player.setAudioAttributes(attrs);
        player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
        if (sound.file != null) {
            player.setDataSource(sound.file.getAbsolutePath());
        } else {
            try (AssetFileDescriptor afd = getResources().openRawResourceFd(sound.raw)) {
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            }
        }
        int gain = sound.gainMb + (cfg.optBoolean("boost", false) ? 900 : 0);
        if (gain > 0) {
            try {
                enhancer = new LoudnessEnhancer(player.getAudioSessionId());
                enhancer.setTargetGain(gain);
                enhancer.setEnabled(true);
            } catch (Throwable e) {
                enhancer = null;
            }
        }
        boolean fadeIn = cfg.optBoolean("fadeIn", false);
        player.setOnPreparedListener(mp -> {
            if (sound.startMs > 0) mp.seekTo(sound.startMs);
            if (fadeIn) fadeIn(mp);
            mp.start();
            started = true;
            long length = sound.endMs > 0 ? sound.endMs - sound.startMs : MAX_PLAY_MS;
            handler.postDelayed(this::fadeOutAndFinish, Math.min(length, MAX_PLAY_MS));
        });
        player.setOnCompletionListener(mp -> finish(false));
        player.setOnErrorListener((mp, what, extra) -> {
            AdhanNotify.prayerAlert(this, prayer, prayerAt, 0);
            finish(false);
            return true;
        });
        player.prepareAsync();

        if (cfg.optBoolean("volumeKeyStops", true)) listenToVolumeKeys();
    }

    private void fadeIn(MediaPlayer mp) {
        final long start = SystemClock.uptimeMillis();
        mp.setVolume(0.05f, 0.05f);
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (player != mp) return;
                float v = Math.min(1f, 0.05f + (SystemClock.uptimeMillis() - start) / (float) FADE_IN_MS);
                try {
                    mp.setVolume(v, v);
                } catch (IllegalStateException e) {
                    return;
                }
                if (v < 1f) handler.postDelayed(this, 200);
            }
        });
    }

    private void fadeOutAndFinish() {
        final MediaPlayer mp = player;
        if (mp == null) return;
        handler.post(new Runnable() {
            float v = 1f;

            @Override
            public void run() {
                if (player != mp) return;
                v -= 0.1f;
                if (v <= 0) {
                    finish(false);
                    return;
                }
                try {
                    mp.setVolume(v, v);
                } catch (IllegalStateException e) {
                    finish(false);
                    return;
                }
                handler.postDelayed(this, 120);
            }
        });
    }

    private void requestFocus(AudioAttributes attrs) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(this, handler)
                .build();
            audio.requestAudioFocus(focusRequest);
        } else {
            audio.requestAudioFocus(this, stream, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
    }

    @Override
    public void onAudioFocusChange(int change) {
        // A call or another app taking over for good: stop. Short notification sounds only duck.
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) finish(false);
    }

    private void listenToVolumeKeys() {
        volumeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                // Our own volume change at the start comes through here too
                if (SystemClock.uptimeMillis() < ignoreVolumeUntil) return;
                finish(true);
            }
        };
        ContextCompat.registerReceiver(this, volumeReceiver, new IntentFilter("android.media.VOLUME_CHANGED_ACTION"), ContextCompat.RECEIVER_EXPORTED);
    }

    private void releasePlayer() {
        handler.removeCallbacksAndMessages(null);
        if (volumeReceiver != null) {
            try {
                unregisterReceiver(volumeReceiver);
            } catch (Exception ignored) {
                // Already gone
            }
            volumeReceiver = null;
        }
        if (enhancer != null) {
            try {
                enhancer.release();
            } catch (Exception ignored) {
                // Already released
            }
            enhancer = null;
        }
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
                // Not started yet
            }
            player.release();
            player = null;
        }
    }

    /** Stop the sound and put volume and audio focus back. Returns whether the azan had started. */
    private boolean quiet(boolean byUser) {
        boolean played = started;
        started = false;
        releasePlayer();
        if (audio != null) {
            if (savedVolume >= 0 && stream >= 0) {
                try {
                    // Put the volume back, unless you changed it yourself while it played
                    if (byUser || audio.getStreamVolume(stream) == setVolume) audio.setStreamVolume(stream, savedVolume, 0);
                } catch (SecurityException ignored) {
                    // Do Not Disturb rules: leave it
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) audio.abandonAudioFocusRequest(focusRequest);
            } else {
                audio.abandonAudioFocus(this);
            }
        }
        savedVolume = -1;
        setVolume = -1;
        focusRequest = null;
        return played;
    }

    /** byUser: stopped with a button (volume goes back even though it was pressed) */
    private void finish(boolean byUser) {
        boolean played = quiet(byUser);
        playing = "";
        if (played && !test) {
            SharedPreferences.Editor e = AdhanConfig.prefs(this).edit();
            e.putLong(LAST_PLAYED_AT, prayerAt).putString(LAST_PLAYED, prayer).apply();
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        // Leave a quiet "Asr · 3:36 PM" behind, like a missed-call entry
        if (played && !test && AdhanNotify.allowed(this)) {
            Notification done = new NotificationCompat.Builder(this, AdhanNotify.CHANNEL_ADHAN)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle(AdhanNotify.title(prayer, prayerAt) + " · " + AdhanNotify.time(this, prayerAt))
                .setContentText("Time for " + AdhanNotify.title(prayer, prayerAt))
                .setSilent(true)
                .setAutoCancel(true)
                .setTimeoutAfter(2 * 60 * 60_000L)
                .setContentIntent(AdhanNotify.openApp(this))
                .build();
            try {
                NotificationManagerCompat.from(this).notify(AdhanNotify.ID_PLAYING, done);
            } catch (SecurityException ignored) {
                // Notifications off
            }
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        playing = "";
        super.onDestroy();
    }

    /** Which recording plays: Fajr always has its own azan */
    static final class Sound {
        final File file;
        final int raw;
        final int startMs, endMs, gainMb;

        private Sound(File file, int raw, int startMs, int endMs, int gainMb) {
            this.file = file;
            this.raw = raw;
            this.startMs = startMs;
            this.endMs = endMs;
            this.gainMb = gainMb;
        }

        static File customFile(Context c, String slot) {
            return new File(new File(c.getFilesDir(), "adhan"), slot);
        }

        static Sound pick(Context c, JSONObject cfg, String prayer) {
            if ("fajr".equals(prayer)) {
                File own = customFile(c, "custom_fajr");
                if ("custom_fajr".equals(cfg.optString("fajrSound", "fajr")) && own.exists()) return new Sound(own, 0, 0, 0, 0);
                // Field recording (Cairo): the muezzin starts ~7 s in and ends at 3:10, and it's
                // quieter than the other one, so it gets a boost at playback (the file itself stays as published)
                return new Sound(null, R.raw.adhan_fajr, 7_200, 190_500, 600);
            }
            File own = customFile(c, "custom");
            if ("custom".equals(cfg.optString("sound", "default")) && own.exists()) return new Sound(own, 0, 0, 0, 0);
            return new Sound(null, R.raw.adhan_default, 0, 0, 0);
        }
    }
}
