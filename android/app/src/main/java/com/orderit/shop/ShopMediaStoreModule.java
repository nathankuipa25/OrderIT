package com.orderit.shop;

import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public final class ShopMediaStoreModule extends ReactContextBaseJavaModule {
    private static final long MAX_IMAGE_BYTES = 15L * 1024L * 1024L;

    ShopMediaStoreModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "ShopMediaStore";
    }

    @ReactMethod
    public void savePng(String source, String filename, Promise promise) {
        Uri pendingUri = null;
        try {
            Uri sourceUri = Uri.parse(source);
            if (sourceUri == null || sourceUri.getScheme() == null) {
                promise.reject("invalid_source", "The order image could not be opened.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName(filename));
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Shop Orders");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                pendingUri = getReactApplicationContext().getContentResolver()
                        .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (pendingUri == null) throw new IllegalStateException("Could not create a gallery image.");
                try (InputStream input = getReactApplicationContext().getContentResolver().openInputStream(sourceUri);
                     OutputStream output = getReactApplicationContext().getContentResolver().openOutputStream(pendingUri, "w")) {
                    copyLimited(input, output);
                }
                ContentValues complete = new ContentValues();
                complete.put(MediaStore.Images.Media.IS_PENDING, 0);
                getReactApplicationContext().getContentResolver().update(pendingUri, complete, null, null);
                promise.resolve("Pictures/Shop Orders/" + safeName(filename));
            } else {
                File pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                File directory = new File(pictures, "Shop Orders");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create the gallery folder.");
                File target = new File(directory, safeName(filename));
                try (InputStream input = getReactApplicationContext().getContentResolver().openInputStream(sourceUri);
                     OutputStream output = new FileOutputStream(target)) {
                    copyLimited(input, output);
                }
                MediaScannerConnection.scanFile(getReactApplicationContext(), new String[]{target.getAbsolutePath()}, new String[]{"image/png"}, null);
                promise.resolve("Pictures/Shop Orders/" + safeName(filename));
            }
        } catch (Exception error) {
            if (pendingUri != null) {
                try { getReactApplicationContext().getContentResolver().delete(pendingUri, null, null); } catch (Exception ignored) {}
            }
            promise.reject("save_failed", "Could not save the order image. Check available storage.", error);
        }
    }

    private static void copyLimited(InputStream input, OutputStream output) throws Exception {
        if (input == null || output == null) throw new IllegalStateException("The order image is unavailable.");
        byte[] buffer = new byte[8192];
        long total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_IMAGE_BYTES) throw new IllegalStateException("The order image is too large to save.");
            output.write(buffer, 0, count);
        }
        if (total == 0) throw new IllegalStateException("The order image is empty.");
        output.flush();
    }

    private static String safeName(String filename) {
        String clean = filename == null ? "order" : filename.trim();
        clean = clean.replaceAll("[^A-Za-z0-9._-]", "_").replaceAll("(?i)\\.png$", "");
        if (clean.isEmpty()) clean = "order";
        if (clean.length() > 80) clean = clean.substring(0, 80);
        return clean + ".png";
    }
}
