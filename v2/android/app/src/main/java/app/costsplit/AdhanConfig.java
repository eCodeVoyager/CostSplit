package app.costsplit;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.TimeZone;

/**
 * Azan settings as the app last sent them (src/lib/adhan/settings.ts,
 * nativeConfig). Kept on the phone so the azan keeps playing with the app
 * closed, after a reboot and after a time zone change.
 */
final class AdhanConfig {
    static final String PREFS = "CostSplitAdhan";
    static final String CONFIG = "config";

    private AdhanConfig() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context c, String json) {
        prefs(c).edit().putString(CONFIG, json).apply();
    }

    /** null until the app has run once with the azan feature */
    static JSONObject load(Context c) {
        String raw = prefs(c).getString(CONFIG, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static final class Place {
        final String name;
        final double lat, lng;
        final AdhanCalc.Params params;

        Place(String name, double lat, double lng, AdhanCalc.Params params) {
            this.name = name;
            this.lat = lat;
            this.lng = lng;
            this.params = params;
        }
    }

    /** A picked city or location, otherwise the city of the phone's time zone right now */
    static Place place(JSONObject cfg) {
        JSONObject fixed = cfg.optJSONObject("fixed");
        if (fixed != null) return parsePlace(fixed);
        JSONObject zones = cfg.optJSONObject("zones");
        if (zones == null) return null;
        String id = TimeZone.getDefault().getID();
        JSONObject zone = zones.optJSONObject(id);
        if (zone == null) {
            // Phones report old names for some zones (Asia/Calcutta): try the canonical one
            try {
                String canonical = android.icu.util.TimeZone.getCanonicalID(id);
                if (canonical != null) zone = zones.optJSONObject(canonical);
            } catch (Throwable ignored) {
                // No ICU: only exact names
            }
        }
        return zone == null ? null : parsePlace(zone);
    }

    private static Place parsePlace(JSONObject o) {
        JSONObject p = o.optJSONObject("params");
        if (p == null) return null;
        AdhanCalc.Params params = new AdhanCalc.Params();
        params.fajr = p.optDouble("fajr", 18);
        params.isha = p.optDouble("isha", 18);
        params.ishaMinutes = p.optDouble("ishaMinutes", 0);
        params.maghribAngle = p.optDouble("maghribAngle", 0);
        params.asr = p.optInt("asr", 1);
        params.highLat = p.optString("highLat", "middle");
        JSONObject adjust = p.optJSONObject("adjust");
        if (adjust != null) {
            for (int i = 0; i < AdhanCalc.NAMES.length; i++) params.adjust[i] = adjust.optDouble(AdhanCalc.NAMES[i], 0);
        }
        return new Place(o.optString("name", ""), o.optDouble("lat", 0), o.optDouble("lng", 0), params);
    }
}
