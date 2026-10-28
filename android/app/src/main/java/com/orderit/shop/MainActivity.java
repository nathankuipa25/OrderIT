package com.orderit.shop;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.media.MediaScannerConnection;
import android.util.Base64;
import android.net.http.SslError;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int WRITE_PERMISSION_REQUEST = 2604;
    private static final long MAX_IMAGE_BYTES = 15L * 1024L * 1024L;

    private final Object pendingLock = new Object();
    private final ArrayDeque<PendingImage> pendingImages = new ArrayDeque<>();
    private final ExecutorService imageWriter = Executors.newSingleThreadExecutor();

    private WebView webView;
    private View loadingView;
    private View errorView;
    private boolean permissionRequestActive;
    private String trustedHost;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(15, 35, 64));
        window.setNavigationBarColor(Color.rgb(15, 35, 64));
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        Uri startUri = Uri.parse(BuildConfig.SHOP_APP_URL);
        trustedHost = startUri.getHost();
        if (!"https".equalsIgnoreCase(startUri.getScheme()) || trustedHost == null) {
            showFatalConfigurationError();
            return;
        }

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.WHITE);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setAlpha(0f);
        frame.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        loadingView = createLoadingView();
        errorView = createErrorView();
        frame.addView(loadingView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        frame.addView(errorView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        errorView.setVisibility(View.GONE);
        setContentView(frame);

        configureWebView();
        webView.loadUrl(BuildConfig.SHOP_APP_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        String userAgent = settings.getUserAgentString();
        if (!userAgent.contains("OrderITShop/1")) {
            settings.setUserAgentString(userAgent + " OrderITShop/1");
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new NativeBridge(), "OrderItNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isTrustedUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !isTrustedUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                showLoading();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                String script = readBridgeScript();
                if (script == null) {
                    showConnectionError("The shop app could not start. Please retry.");
                    return;
                }
                view.evaluateJavascript(script, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showConnectionError("Connect to the internet to sign in. After the first shop sync, saved orders can be used offline.");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showConnectionError("A secure connection could not be established. Check the connection and retry.");
            }
        });
    }

    private boolean isTrustedUrl(Uri uri) {
        if (uri == null || trustedHost == null) return false;
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!trustedHost.equalsIgnoreCase(uri.getHost())) return false;
        int port = uri.getPort();
        return port == -1 || port == 443;
    }

    private String readBridgeScript() {
        try (InputStream input = getAssets().open("native-bridge.js")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private View createLoadingView() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.WHITE);
        ProgressBar spinner = new ProgressBar(this);
        panel.addView(spinner, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        TextView title = new TextView(this);
        title.setText("Shop Orders");
        title.setTextColor(Color.rgb(15, 35, 64));
        title.setTextSize(20f);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 18, 0, 0);
        panel.addView(title);
        return panel;
    }

    private View createErrorView() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(32, 32, 32, 32);
        panel.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("Shop Orders is offline");
        title.setTextColor(Color.rgb(15, 35, 64));
        title.setTextSize(22f);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);

        TextView message = new TextView(this);
        message.setText("Connect to the internet to sign in or retry. After the first successful shop sync, saved orders can be used offline.");
        message.setTextColor(Color.rgb(85, 95, 110));
        message.setTextSize(15f);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, 12, 0, 22);
        panel.addView(message);

        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(15, 35, 64)));
        retry.setOnClickListener(v -> webView.loadUrl(BuildConfig.SHOP_APP_URL));
        panel.addView(retry);
        return panel;
    }

    private void showFatalConfigurationError() {
        TextView message = new TextView(this);
        message.setText("Shop Orders could not start because its secure service address is not configured.");
        message.setTextColor(Color.rgb(15, 35, 64));
        message.setGravity(Gravity.CENTER);
        message.setPadding(32, 32, 32, 32);
        setContentView(message);
    }

    private void showLoading() {
        runOnUiThread(() -> {
            if (webView != null) webView.setAlpha(0f);
            if (errorView != null) errorView.setVisibility(View.GONE);
            if (loadingView != null) loadingView.setVisibility(View.VISIBLE);
        });
    }

    private void showShopUi() {
        runOnUiThread(() -> {
            if (loadingView != null) loadingView.setVisibility(View.GONE);
            if (errorView != null) errorView.setVisibility(View.GONE);
            if (webView != null) {
                webView.setVisibility(View.VISIBLE);
                webView.animate().alpha(1f).setDuration(140).start();
            }
        });
    }

    private void showConnectionError(String message) {
        runOnUiThread(() -> {
            if (webView != null) webView.setAlpha(0f);
            if (loadingView != null) loadingView.setVisibility(View.GONE);
            if (errorView instanceof LinearLayout) {
                LinearLayout layout = (LinearLayout) errorView;
                if (layout.getChildCount() > 1 && layout.getChildAt(1) instanceof TextView) {
                    ((TextView) layout.getChildAt(1)).setText(message);
                }
                errorView.setVisibility(View.VISIBLE);
            }
        });
    }

    private String safePngName(String filename) {
        String clean = filename == null ? "order" : filename.trim();
        clean = clean.replaceAll("[^A-Za-z0-9._-]", "_");
        clean = clean.replaceAll("(?i)\\.png$", "");
        if (clean.isEmpty()) clean = "order";
        if (clean.length() > 80) clean = clean.substring(0, 80);
        return clean + ".png";
    }

    private String saveOrderPng(String filename, String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:image/png;base64,")) return "error";
        String encoded = dataUrl.substring("data:image/png;base64,".length());
        if (encoded.length() > (MAX_IMAGE_BYTES * 4L / 3L) + 16L) return "error";
        byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            return "error";
        }
        if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) return "error";

        PendingImage image = new PendingImage(safePngName(filename), bytes);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || hasLegacyWritePermission()) {
            imageWriter.execute(() -> writeImage(image));
        } else {
            synchronized (pendingLock) {
                pendingImages.addLast(image);
            }
            requestLegacyWritePermission();
        }
        return "queued";
    }

    private boolean hasLegacyWritePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                || checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestLegacyWritePermission() {
        runOnUiThread(() -> {
            if (hasLegacyWritePermission()) {
                drainPendingImages();
                return;
            }
            synchronized (pendingLock) {
                if (permissionRequestActive) return;
                permissionRequestActive = true;
            }
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, WRITE_PERMISSION_REQUEST);
        });
    }

    private void drainPendingImages() {
        List<PendingImage> images = new ArrayList<>();
        synchronized (pendingLock) {
            permissionRequestActive = false;
            while (!pendingImages.isEmpty()) images.add(pendingImages.removeFirst());
        }
        for (PendingImage image : images) imageWriter.execute(() -> writeImage(image));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != WRITE_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            drainPendingImages();
        } else {
            synchronized (pendingLock) {
                pendingImages.clear();
                permissionRequestActive = false;
            }
            showToast("Allow file access to save order images.");
        }
    }

    private void writeImage(PendingImage image) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeToMediaStore(image);
            } else {
                writeToPicturesDirectory(image);
            }
            showToast("Order image saved to Pictures/Shop Orders");
        } catch (Exception error) {
            showToast("Could not save the order image. Check available storage.");
        }
    }

    private void writeToMediaStore(PendingImage image) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, image.filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Shop Orders");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("MediaStore could not create the image.");
        boolean complete = false;
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("Image output is unavailable.");
            output.write(image.bytes);
            output.flush();
        }
        try {
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Images.Media.IS_PENDING, 0);
            if (getContentResolver().update(uri, ready, null, null) < 1) {
                throw new IllegalStateException("Could not publish the saved image.");
            }
            complete = true;
        } finally {
            if (!complete) getContentResolver().delete(uri, null, null);
        }
    }

    @SuppressWarnings("deprecation")
    private void writeToPicturesDirectory(PendingImage image) throws Exception {
        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Shop Orders");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create Pictures folder.");
        File outputFile = new File(directory, image.filename);
        try (FileOutputStream output = new FileOutputStream(outputFile)) {
            output.write(image.bytes);
            output.flush();
        }
        MediaScannerConnection.scanFile(this, new String[]{outputFile.getAbsolutePath()}, new String[]{"image/png"}, null);
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("OrderItNative");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        imageWriter.shutdown();
        super.onDestroy();
    }

    public final class NativeBridge {
        @JavascriptInterface
        public void allowShopUi() {
            showShopUi();
        }

        @JavascriptInterface
        public String saveOrderPng(String filename, String dataUrl) {
            return MainActivity.this.saveOrderPng(filename, dataUrl);
        }

        @JavascriptInterface
        public void showMessage(String message) {
            if (message == null) return;
            String safe = message.length() > 120 ? message.substring(0, 120) : message;
            showToast(safe);
        }
    }

    private static final class PendingImage {
        final String filename;
        final byte[] bytes;

        PendingImage(String filename, byte[] bytes) {
            this.filename = filename;
            this.bytes = bytes;
        }
    }
}
