package il.co.yellowzone.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // §559 — התוסף נרשם לפני super.onCreate (שם נוצר הגשר); התמונה מעל ה-WebView מיד אחריו
        registerPlugin(YZSplashPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) YZSplash.attach(this, getBridge().getWebView());
    }
}
