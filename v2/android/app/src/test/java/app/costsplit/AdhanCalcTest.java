package app.costsplit;

import static org.junit.Assert.assertArrayEquals;

import org.junit.Test;

/**
 * AdhanCalc must give exactly what src/lib/adhan/calc.ts gives (the Prayer
 * screen shows those times; the phone plays at these). Expected values were
 * produced by calc.ts; if you change the formulas, change both and regenerate.
 *
 *   node scripts/gradle.mjs testDebugUnitTest
 */
public class AdhanCalcTest {
    private static AdhanCalc.Params params(double fajr, double isha, double ishaMinutes, double maghribAngle, int asr, String highLat, double dhuhrAdjust) {
        AdhanCalc.Params p = new AdhanCalc.Params();
        p.fajr = fajr;
        p.isha = isha;
        p.ishaMinutes = ishaMinutes;
        p.maghribAngle = maghribAngle;
        p.asr = asr;
        p.highLat = highLat;
        p.adjust[AdhanCalc.DHUHR] = dhuhrAdjust;
        p.adjust[AdhanCalc.MAGHRIB] = 2;
        return p;
    }

    @Test
    public void dhakaKarachiHanafi() {
        assertArrayEquals(
            new long[] { 1795215480000L, 1795220220000L, 1795239900000L, 1795253700000L, 1795259580000L, 1795264200000L },
            AdhanCalc.times(2026, 11, 21, 23.8103, 90.4125, params(18, 18, 0, 0, 2, "middle", 1))
        );
    }

    @Test
    public void makkahUmmAlQura() {
        assertArrayEquals(
            new long[] { 1773972540000L, 1773977100000L, 1773998880000L, 1774011180000L, 1774020840000L, 1774026120000L },
            AdhanCalc.times(2026, 3, 20, 21.4225, 39.8262, params(18.5, 0, 90, 0, 1, "middle", 0))
        );
    }

    @Test
    public void osloSummerSeventhOfNight() {
        assertArrayEquals(
            new long[] { 1782004140000L, 1782006840000L, 1782040800000L, 1782057600000L, 1782074760000L, 1782077280000L },
            AdhanCalc.times(2026, 6, 21, 59.9139, 10.7522, params(18, 17, 0, 0, 1, "seventh", 1))
        );
    }

    @Test
    public void tehranMaghribAngle() {
        assertArrayEquals(
            new long[] { 1797819000000L, 1797824400000L, 1797841920000L, 1797851220000L, 1797860820000L, 1797863760000L },
            AdhanCalc.times(2026, 12, 21, 35.6892, 51.389, params(17.7, 14, 0, 4.5, 1, "middle", 0))
        );
    }

    @Test
    public void sydneySouthernSummer() {
        assertArrayEquals(
            new long[] { 1798736640000L, 1798742820000L, 1798768740000L, 1798782180000L, 1798794660000L, 1798800360000L },
            AdhanCalc.times(2027, 1, 1, -33.8688, 151.2093, params(18, 17, 0, 0, 1, "middle", 1))
        );
    }
}
