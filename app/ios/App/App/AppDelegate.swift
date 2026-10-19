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
    }

    // WKWebView עלול להוסיף תת-views משלו אחרי הטעינה — לשמור את הרקע עליון.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webView?.bringSubviewToFront(statusBarBackdrop)
    }
}
