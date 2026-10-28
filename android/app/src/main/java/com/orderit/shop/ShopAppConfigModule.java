package com.orderit.shop;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public final class ShopAppConfigModule extends ReactContextBaseJavaModule {
    ShopAppConfigModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "ShopAppConfig";
    }

    @ReactMethod
    public void getApiBaseUrl(Promise promise) {
        promise.resolve(BuildConfig.SHOP_APP_URL);
    }
}
