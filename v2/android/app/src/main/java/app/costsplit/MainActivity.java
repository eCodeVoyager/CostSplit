package app.costsplit;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before the WebView picks which files to load: roll back a live update
        // that never started properly, or drop old ones after an APK install
        LiveUpdates.beforeStart(getApplicationContext());
        // App-only plugins must be registered before the bridge starts
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
