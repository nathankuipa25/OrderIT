# JavaScript bridge entry points are discovered by WebView at runtime.
-keepclassmembers class com.orderit.shop.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
