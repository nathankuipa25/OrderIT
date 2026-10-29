import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appTheme = readFileSync(
  new URL('../android/app/src/main/res/values/styles.xml', import.meta.url),
  'utf8',
);
const manifest = readFileSync(
  new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);

test('React Native launcher uses an AppCompat theme', () => {
  assert.match(
    appTheme,
    /<style\s+name="AppTheme"\s+parent="Theme\.AppCompat\.Light\.NoActionBar">/,
  );
  assert.match(manifest, /android:theme="@style\/AppTheme"/);
});
