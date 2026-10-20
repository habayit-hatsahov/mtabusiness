import UIKit
import WebKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // §457 — Firebase רק כשקובץ ההגדרות באמת בחבילה: configure() בלעדיו מפיל את האפליקציה בפתיחה.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        return true
    }

    // ── §457 — פוש באייפון ────────────────────────────────────────────────────────────────
    // אפל נותנת טוקן APNs (בייטים), אבל הוורקר שולח דרך FCM (fcm.js) – כמו באנדרואיד. לכן
    // ממירים כאן ל-טוקן FCM ומעבירים אותו לתוסף כמחרוזת: התוסף מקבל גם String ויורה איתו את
    // האירוע `registration` שהאתר (native-push.js) כבר מחכה לו. בלי שתי הפונקציות האלה
    // האירוע לא נורה כלל וההרשמה נגמרת ב-timeout.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                            object: NSError(domain: "YZPush", code: 1, userInfo: [NSLocalizedDescriptionKey: "firebase_not_configured"]))
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let token = token, !token.isEmpty {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            } else {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                                object: error ?? NSError(domain: "YZPush", code: 2, userInfo: [NSLocalizedDescriptionKey: "empty_fcm_token"]))
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// §480 — רקע אטום מאחורי שורת השעה.
// `ios.contentInset: always` (§458ב) מזיז את התוכן מתחת לשורת השעה, אבל בגלילה הוא עובר
// מאחוריה, והשעה שקופה. מצד האתר אי אפשר לצייר שם (§477: fixed עם top שלילי לא מצויר).
// ב-Capacitor ה-`view` של הבקר **הוא** ה-WKWebView (`loadView`: `view = webView`), ולכן
// view שנוסף אליו יושב מעל ה-scrollView ולא נגלל איתו. הגובה = ה-safe area העליון, כך
// שבכל דגם (אי דינמי, נוץ', SE) ובלרוחב (0) הוא מכסה בדיוק את אזור השעה.
// לבן = `ios.backgroundColor` ב-capacitor.config.json, הצבע שכבר מוצג שם במצב מנוחה.
// הבקר מחובר ב-Main.storyboard (`customClass="MainViewController"`, `customModule="App"`).
class MainViewController: CAPBridgeViewController {
    private let statusBarBackdrop = UIView()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let host = webView else { return }
        statusBarBackdrop.backgroundColor = .white
        statusBarBackdrop.isUserInteractionEnabled = false
        statusBarBackdrop.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(statusBarBackdrop)
        NSLayoutConstraint.activate([
            statusBarBackdrop.topAnchor.constraint(equalTo: host.topAnchor),
            statusBarBackdrop.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            statusBarBackdrop.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            statusBarBackdrop.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor),
        ])
        // §559 — תמונת הפתיחה כבר בפריים הראשון (לפני שהאתר נטען), והתוסף שהאתר מוריד איתו אותה
        YZSplash.shared.attach(to: host)
        bridge?.registerPluginInstance(YZSplashPlugin())
    }

    // WKWebView עלול להוסיף תת-views משלו אחרי הטעינה — לשמור את הרקע ואת תמונת הפתיחה עליונים.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webView?.bringSubviewToFront(statusBarBackdrop)
        YZSplash.shared.bringToFront()
    }
}

// ══ §559 — מסך פתיחה עם תמונה, מהפריים הראשון ═════════════════════════════════════════════
// רמי: "אין אופציה לבטל את המסך הלבן ושיהיה ישר את התמונות?". האתר נטען מהרשת, ועד שהוא מצייר
// עוברות 2–3 שניות של לבן. לכן האפליקציה עצמה מציגה את התמונה הבאה בתור מיד בפתיחה, והאתר
// (splash-photo.js) מצייר מתחתיה **את אותה תמונה בדיוק** (שואל `current`), ורק אחרי שצייר –
// קורא `hide`. כל הזמן יש על המסך אותה תמונה, אז אין רגע ריק ואין קפיצה.
//
// • הרשימה = מרכז הניהול ← "מסך פתיחה": האתר מעביר אותה (`setList`) בכל פתיחה, והתמונות יורדות
//   לכאן ברקע. תמונה חדשה מופיעה מהפתיחה שאחרי שירדה. עד שיש רשימה – 6 התמונות שבחבילה.
// • הסדר נקבע כאן בלבד (האתר לא בוחר כשיש תמונה נייטיב): נקודת התחלה אקראית, ואז לפי הסדר.
// • המיקום זהה לשכבה של האתר: מתחת לשורת השעה ועד תחתית המסך, aspectFill = object-fit:cover.
// • רשת ביטחון: יורדת לבד אחרי 8 שניות (דף שלא קורא hide, למשל קישור ישיר לדף אחר).
final class YZSplash {
    static let shared = YZSplash()
    private static let defaults = (1...6).map { "https://yellowzone.co.il/images/splash/splash-\($0)-s.jpg" }
    private static let kUrls = "yzSplashUrls", kEnabled = "yzSplashEnabled", kIdx = "yzSplashIdx"
    private let ud = UserDefaults.standard
    private var overlay: UIImageView?
    private(set) var currentURL = ""
    private(set) var shownAt: Double = 0

    var isShowing: Bool { overlay != nil }

    private var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("yz_splash", isDirectory: true)
    }
    private func fileURL(_ url: String) -> URL {
        let safe = String(url.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || $0 == "." || $0 == "-" ? Character($0) : "_" })
        return dir.appendingPathComponent(String(safe.suffix(150)))
    }
    // קובץ שירד מהאתר קודם (אם התמונה בכתובת הזו הוחלפה – זה העדכני); אחרת התמונה שבחבילה
    private func image(for url: String) -> UIImage? {
        if let img = UIImage(contentsOfFile: fileURL(url).path) { return img }
        guard let r = url.range(of: "/images/splash/splash-[0-9]+-s\\.jpg$", options: .regularExpression) else { return nil }
        let name = String(url[r].dropFirst("/images/splash/".count).dropLast(".jpg".count))
        return UIImage(named: name)
    }
    private func list() -> [String] {
        if ud.object(forKey: Self.kUrls) == nil { return Self.defaults }
        return ud.stringArray(forKey: Self.kUrls) ?? []
    }

    func attach(to host: UIView) {
        guard overlay == nil, ud.object(forKey: Self.kEnabled) as? Bool ?? true else { return }
        let urls = list()
        guard !urls.isEmpty else { return }
        let start = ud.object(forKey: Self.kIdx) as? Int ?? Int.random(in: 0..<urls.count)
        for k in 0..<urls.count {
            let i = (start + k) % urls.count
            guard let img = image(for: urls[i]) else { continue }
            let v = UIImageView(image: img)
            v.contentMode = .scaleAspectFill
            v.clipsToBounds = true
            v.backgroundColor = .white
            v.isUserInteractionEnabled = true   // לא מעבירים נגיעות לאתר שמתחת
            v.translatesAutoresizingMaskIntoConstraints = false
            host.addSubview(v)
            NSLayoutConstraint.activate([
                v.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor),
                v.bottomAnchor.constraint(equalTo: host.bottomAnchor),
                v.leadingAnchor.constraint(equalTo: host.leadingAnchor),
                v.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            ])
            overlay = v
            currentURL = urls[i]
            shownAt = Date().timeIntervalSince1970 * 1000
            ud.set((i + 1) % urls.count, forKey: Self.kIdx)
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.hide() }
            return
        }
    }

    func bringToFront() {
        if let v = overlay { v.superview?.bringSubviewToFront(v) }
    }

    func hide() {
        guard let v = overlay else { return }
        overlay = nil
        UIView.animate(withDuration: 0.15, animations: { v.alpha = 0 }, completion: { _ in v.removeFromSuperview() })
    }

    // האתר מעביר את הרשימה מ-settings/splashScreen; מורידים מה שחסר ומוחקים מה שירד מהרשימה
    func setList(enabled: Bool, urls: [String]) {
        ud.set(enabled, forKey: Self.kEnabled)
        ud.set(urls, forKey: Self.kUrls)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let keep = Set(urls.map { fileURL($0).lastPathComponent })
        if let files = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
            for f in files where !keep.contains(f) { try? FileManager.default.removeItem(at: dir.appendingPathComponent(f)) }
        }
        for u in urls {
            let dest = fileURL(u)
            guard !FileManager.default.fileExists(atPath: dest.path), let src = URL(string: u), src.scheme == "https" else { continue }
            URLSession.shared.dataTask(with: src) { data, resp, _ in
                guard let data = data, (resp as? HTTPURLResponse)?.statusCode == 200, UIImage(data: data) != nil else { return }
                try? data.write(to: dest, options: .atomic)
            }.resume()
        }
    }
}

@objc(YZSplashPlugin)
public class YZSplashPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YZSplashPlugin"
    public let jsName = "YZSplash"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setList", returnType: CAPPluginReturnPromise),
    ]

    @objc func current(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let s = YZSplash.shared
            call.resolve(["shown": s.isShowing, "url": s.currentURL, "shownAt": s.shownAt])
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { YZSplash.shared.hide(); call.resolve() }
    }

    @objc func setList(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        let urls = (call.getArray("urls", String.self) ?? []).filter { $0.hasPrefix("https://") }
        DispatchQueue.main.async { YZSplash.shared.setList(enabled: enabled, urls: urls); call.resolve() }
    }
}
