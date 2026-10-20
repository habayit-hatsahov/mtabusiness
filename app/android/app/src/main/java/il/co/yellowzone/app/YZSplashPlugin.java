package il.co.yellowzone.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/** §559 — הגשר בין האתר לתמונת הפתיחה הנייטיב (YZSplash). אותם שמות כמו באייפון. */
@CapacitorPlugin(name = "YZSplash")
public class YZSplashPlugin extends Plugin {

    @PluginMethod
    public void current(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject r = new JSObject();
            r.put("shown", YZSplash.isShowing());
            r.put("url", YZSplash.currentUrl);
            r.put("shownAt", YZSplash.shownAt);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> { YZSplash.hide(); call.resolve(); });
    }

    @PluginMethod
    public void setList(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        List<String> urls = new ArrayList<>();
        JSArray arr = call.getArray("urls", new JSArray());
        for (int i = 0; i < arr.length(); i++) {
            String u = arr.optString(i, "");
            if (u.startsWith("https://")) urls.add(u);
        }
        YZSplash.setList(getActivity(), enabled, urls);
        call.resolve();
    }
}
