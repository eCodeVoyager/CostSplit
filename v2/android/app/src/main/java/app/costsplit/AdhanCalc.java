package app.costsplit;

/**
 * Prayer times from the sun's position: a line-by-line port of
 * src/lib/adhan/calc.ts (prayerTimes), so the phone plays the azan at exactly
 * the minute the Prayer screen shows. Change both together.
 *
 * Pure Java, no Android classes, so it can be checked on a desktop JVM.
 */
final class AdhanCalc {
    static final int FAJR = 0, SUNRISE = 1, DHUHR = 2, ASR = 3, MAGHRIB = 4, ISHA = 5;
    static final String[] NAMES = { "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha" };
    /** A time that doesn't exist that day (never happens with a high-latitude rule) */
    static final long NONE = Long.MIN_VALUE;

    static final class Params {
        double fajr = 18, isha = 18, ishaMinutes = 0, maghribAngle = 0;
        /** 1 = standard Asr, 2 = Hanafi */
        int asr = 1;
        /** none, middle, seventh, angle */
        String highLat = "middle";
        /** Minutes added to each time, indexed like NAMES */
        final double[] adjust = new double[6];
    }

    private static final double RAD = Math.PI / 180;
    private static final double RISE_SET_ANGLE = 0.833;

    private AdhanCalc() {}

    private static double sin(double d) { return Math.sin(d * RAD); }
    private static double cos(double d) { return Math.cos(d * RAD); }
    private static double tan(double d) { return Math.tan(d * RAD); }
    private static double asin(double x) { return Math.asin(x) / RAD; }
    private static double acos(double x) { return Math.acos(x) / RAD; }
    private static double atan2(double y, double x) { return Math.atan2(y, x) / RAD; }
    private static double acot(double x) { return Math.atan(1 / x) / RAD; }

    private static double fix(double a, double b) {
        double r = a - b * Math.floor(a / b);
        return r < 0 ? r + b : r;
    }

    private static double hoursBetween(double a, double b) { return fix(b - a, 24); }

    private static boolean finite(double v) { return !Double.isNaN(v) && !Double.isInfinite(v); }

    static double julianDay(int year, int month, int day) {
        if (month <= 2) {
            year -= 1;
            month += 12;
        }
        double a = Math.floor(year / 100.0);
        double b = 2 - a + Math.floor(a / 4);
        return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
    }

    /** {declination (degrees), equation of time (hours)} */
    private static double[] sun(double jd) {
        double d = jd - 2451545.0;
        double g = fix(357.529 + 0.98560028 * d, 360);
        double q = fix(280.459 + 0.98564736 * d, 360);
        double l = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
        double e = 23.439 - 0.00000036 * d;
        double ra = fix(atan2(cos(e) * sin(l), cos(l)) / 15, 24);
        return new double[] { asin(sin(e) * sin(l)), q / 15 - ra };
    }

    private static final class Day {
        final double jdate, lat;
        Day(double jdate, double lat) { this.jdate = jdate; this.lat = lat; }

        double midDay(double t) { return fix(12 - sun(jdate + t / 24)[1], 24); }

        double sunAngleTime(double angle, double t, boolean before) {
            double decl = sun(jdate + t / 24)[0];
            double noon = midDay(t);
            double h = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
            return noon + (before ? -h : h);
        }

        double asrTime(double factor, double t) {
            double decl = sun(jdate + t / 24)[0];
            return sunAngleTime(-acot(factor + tan(Math.abs(lat - decl))), t, false);
        }
    }

    private static double or(double v, double fallback) { return finite(v) ? v : fallback; }

    /** Times for one calendar day (month 1-12) as epoch ms, rounded to the minute; NONE if missing */
    static long[] times(int year, int month, int day, double lat, double lng, Params p) {
        Day d = new Day(julianDay(year, month, day) - lng / (15 * 24), lat);

        double tFajr = 5, tSunrise = 6, tDhuhr = 12, tAsr = 13, tSunset = 18, tMaghrib = 18, tIsha = 18;
        for (int i = 0; i < 2; i++) {
            double nFajr = or(d.sunAngleTime(p.fajr, tFajr, true), 5);
            double nSunrise = or(d.sunAngleTime(RISE_SET_ANGLE, tSunrise, true), 6);
            double nDhuhr = d.midDay(tDhuhr);
            double nAsr = or(d.asrTime(p.asr, tAsr), 13);
            double nSunset = or(d.sunAngleTime(RISE_SET_ANGLE, tSunset, false), 18);
            double nMaghrib = p.maghribAngle > 0 ? or(d.sunAngleTime(p.maghribAngle, tMaghrib, false), 18) : 18;
            double nIsha = p.ishaMinutes > 0 ? 18 : or(d.sunAngleTime(p.isha, tIsha, false), 18);
            tFajr = nFajr;
            tSunrise = nSunrise;
            tDhuhr = nDhuhr;
            tAsr = nAsr;
            tSunset = nSunset;
            tMaghrib = nMaghrib;
            tIsha = nIsha;
        }
        double fajr = d.sunAngleTime(p.fajr, tFajr, true);
        double sunrise = d.sunAngleTime(RISE_SET_ANGLE, tSunrise, true);
        double dhuhr = d.midDay(tDhuhr);
        double asr = d.asrTime(p.asr, tAsr);
        double sunset = d.sunAngleTime(RISE_SET_ANGLE, tSunset, false);
        double maghrib = p.maghribAngle > 0 ? d.sunAngleTime(p.maghribAngle, tMaghrib, false) : sunset;
        double isha = p.ishaMinutes > 0 ? maghrib + p.ishaMinutes / 60 : d.sunAngleTime(p.isha, tIsha, false);

        if (!"none".equals(p.highLat) && finite(sunrise) && finite(sunset)) {
            double night = hoursBetween(sunset, sunrise);
            double fajrLimit = share(p.highLat, p.fajr) * night;
            if (!finite(fajr) || hoursBetween(fajr, sunrise) > fajrLimit) fajr = sunrise - fajrLimit;
            if (p.ishaMinutes <= 0) {
                double ishaLimit = share(p.highLat, p.isha) * night;
                if (!finite(isha) || hoursBetween(sunset, isha) > ishaLimit) isha = sunset + ishaLimit;
            }
            if (p.maghribAngle > 0) {
                double limit = share(p.highLat, p.maghribAngle) * night;
                if (!finite(maghrib) || hoursBetween(sunset, maghrib) > limit) maghrib = sunset + limit;
            }
        }

        // Date.UTC(year, month - 1, day) in calc.ts
        double base = (julianDay(year, month, day) - 2440587.5) * 86400000.0;
        double[] hours = { fajr, sunrise, dhuhr, asr, maghrib, isha };
        long[] out = new long[6];
        for (int i = 0; i < 6; i++) {
            if (!finite(hours[i])) {
                out[i] = NONE;
                continue;
            }
            double ms = base + (hours[i] - lng / 15 + p.adjust[i] / 60) * 3600000.0;
            out[i] = Math.round(ms / 60000.0) * 60000L;
        }
        return out;
    }

    private static double share(String rule, double angle) {
        if ("angle".equals(rule)) return angle / 60;
        if ("seventh".equals(rule)) return 1.0 / 7;
        return 1.0 / 2;
    }
}
