package il.co.yellowzone.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.ImageView;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * §559 — תמונת הפתיחה מהפריים הראשון (אותו מנגנון כמו YZSplash ב-AppDelegate.swift באייפון).
 * האפליקציה מציגה מיד את התמונה הבאה בתור, האתר (splash-photo.js) מצייר מתחתיה את אותה תמונה
 * (שואל current) ורק אחרי שצייר קורא hide. הרשימה מגיעה מהאתר (setList, מתוך settings/splashScreen),
 * התמונות יורדות לכאן ברקע; עד שיש רשימה – 6 התמונות שבחבילה (res/drawable-nodpi/yz_splash_N.jpg).
 * המיקום = בדיוק הגבולות של ה-WebView, CENTER_CROP = object-fit:cover. רשת ביטחון: 8 שניות.
 */
final class YZSplash {
    private static final String PREFS = "yz_splash", K_URLS = "urls", K_ENABLED = "enabled", K_IDX = "idx";
    private static final Pattern BUNDLED = Pattern.compile("/images/splash/splash-([0-9]+)-s\\.jpg$");

    private static ImageView overlay;
    static String currentUrl = "";
    static double shownAt = 0;

    static boolean isShowing() { return overlay != null; }

    private static List<String> defaults() {
        List<String> l = new ArrayList<>();
        for (int i = 1; i <= 6; i++) l.add("https://yellowzone.co.il/images/splash/splash-" + i + "-s.jpg");
        return l;
    }

    private static File dir(Activity a) { return new File(a.getFilesDir(), "yz_splash"); }

    private static File fileFor(Activity a, String url) {
        String safe = url.replaceAll("[^A-Za-z0-9.\\-]", "_");
        if (safe.length() > 150) safe = safe.substring(safe.length() - 150);
        return new File(dir(a), safe);
    }

    // קובץ שירד מהאתר (העדכני), אחרת התמונה שבחבילה
    private static Bitmap bitmapFor(Activity a, String url) {
        File f = fileFor(a, url);
        if (f.exists()) {
            Bitmap b = BitmapFactory.decodeFile(f.getPath());
            if (b != null) return b;
        }
        Matcher m = BUNDLED.matcher(url);
        if (!m.find()) return null;
        int id = a.getResources().getIdentifier("yz_splash_" + m.group(1), "drawable", a.getPackageName());
        return id == 0 ? null : BitmapFactory.decodeResource(a.getResources(), id);
    }

    private static List<String> list(SharedPreferences p) {
        String raw = p.getString(K_URLS, null);
        if (raw == null) return defaults();
        List<String> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) out.add(arr.getString(i));
        } catch (Exception e) { return defaults(); }
        return out;
    }

    static void attach(Activity a, WebView web) {
        if (overlay != null || web == null || !(web.getParent() instanceof ViewGroup)) return;
        SharedPreferences p = a.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
        if (!p.getBoolean(K_ENABLED, true)) return;
        List<String> urls = list(p);
        if (urls.isEmpty()) return;
        int start = p.contains(K_IDX) ? p.getInt(K_IDX, 0) : new Random().nextInt(urls.size());
        for (int k = 0; k < urls.size(); k++) {
            int i = (start + k) % urls.size();
            Bitmap b = bitmapFor(a, urls.get(i));
            if (b == null) continue;
            final ImageView v = new ImageView(a);
            v.setImageBitmap(b);
            v.setScaleType(ImageView.ScaleType.CENTER_CROP);
            v.setBackgroundColor(Color.WHITE);
            v.setClickable(true);   // לא מעבירים נגיעות לאתר שמתחת
            ViewGroup parent = (ViewGroup) web.getParent();
            parent.addView(v, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            // בדיוק על הגבולות של ה-WebView (גם אם הוזז בגלל שורות המערכת)
            final WebView w = web;
            View.OnLayoutChangeListener sync = (vv, l, t, r, bt, ol, ot, or, ob) -> {
                if (overlay == null) return;
                v.setX(w.getX()); v.setY(w.getY());
                ViewGroup.LayoutParams lp = v.getLayoutParams();
                if (lp.width != w.getWidth() || lp.height != w.getHeight()) {
                    lp.width = w.getWidth(); lp.height = w.getHeight(); v.setLayoutParams(lp);
                }
            };
            web.addOnLayoutChangeListener(sync);
            web.post(() -> sync.onLayoutChange(w, 0, 0, 0, 0, 0, 0, 0, 0));
            overlay = v;
            currentUrl = urls.get(i);
            shownAt = System.currentTimeMillis();
            p.edit().putInt(K_IDX, (i + 1) % urls.size()).apply();
            v.postDelayed(YZSplash::hide, 8000);
            return;
        }
    }

    static void hide() {
        final ImageView v = overlay;
        if (v == null) return;
        overlay = null;
        v.animate().alpha(0f).setDuration(150).withEndAction(() -> {
            if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
        }).start();
    }

    // האתר מעביר את הרשימה; מורידים מה שחסר ומוחקים מה שירד מהרשימה
    static void setList(Activity a, boolean enabled, List<String> urls) {
        a.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit()
            .putBoolean(K_ENABLED, enabled).putString(K_URLS, new JSONArray(urls).toString()).apply();
        final File d = dir(a);
        final List<String> todo = new ArrayList<>();
        final Set<String> keep = new HashSet<>();
        for (String u : urls) { keep.add(fileFor(a, u).getName()); todo.add(u); }
        final Activity act = a;
        new Thread(() -> {
            //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
            File[] files = d.listFiles();
            if (files != null) for (File f : files) if (!keep.contains(f.getName())) //noinspection ResultOfMethodCallIgnored
                f.delete();
            for (String u : todo) {
                File dest = fileFor(act, u);
                if (dest.exists() || !u.startsWith("https://")) continue;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    if (c.getResponseCode() != 200) continue;
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    try (InputStream in = c.getInputStream()) {
                        byte[] chunk = new byte[16384]; int n;
                        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                    }
                    byte[] bytes = buf.toByteArray();
                    if (BitmapFactory.decodeByteArray(bytes, 0, bytes.length) == null) continue;   // לא תמונה
                    File tmp = new File(d, dest.getName() + ".tmp");
                    try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(bytes); }
                    //noinspection ResultOfMethodCallIgnored
                    tmp.renameTo(dest);
                } catch (Exception ignored) {
                } finally { if (c != null) c.disconnect(); }
            }
        }).start();
    }
}
