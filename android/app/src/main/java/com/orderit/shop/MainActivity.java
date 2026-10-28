package com.orderit.shop;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public final class MainActivity extends ReactActivity {
    @Override
    protected String getMainComponentName() {
        return "OrderItShop";
    }

    @Override
    protected ReactActivityDelegate createReactActivityDelegate() {
        return new DefaultReactActivityDelegate(
                this,
                getMainComponentName(),
                BuildConfig.IS_NEW_ARCHITECTURE_ENABLED);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(16, 37, 58));
        window.setNavigationBarColor(Color.rgb(255, 255, 255));
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        super.onCreate(null);
    }
}
