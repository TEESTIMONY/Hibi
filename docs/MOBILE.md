# Hibi mobile: Android foundation

The Android app packages the existing Hibi interface with Capacitor 8. It uses the same Django accounts, tasks and scheduling API. Web deployment remains independent. The bundle contains local UI assets, not a remotely loaded website.

## Prepare and run

1. Install Android Studio and the SDK/JDK required by Capacitor 8: https://capacitorjs.com/docs/getting-started/environment-setup
2. Run `npm ci` in the repository root.
3. In PowerShell set `$env:HIBI_API_BASE_URL = 'https://35.181.96.164'`, then run `npm run mobile:sync`. This rejects localhost API URLs because a phone cannot reach this computer via its own localhost.
4. Add `https://localhost` to the backend's existing `HIBI_FRONTEND_ORIGINS` list, preserving the Vercel origin, and restart Django. This is the bundled Android application's origin. Never enable all origins or put secrets in the mobile bundle.
5. Run `npm run mobile:open`, select a physical device or emulator in Android Studio, and run the app.
6. Test sign-in, task save/reload, schedules, sign-out, keyboard and safe areas on a real phone.

For a development APK run `android\gradlew.bat -p android assembleDebug` after SDK/JDK setup. The output is `android/app/build/outputs/apk/debug/app-debug.apk`. Use a signed release APK for wider distribution and keep the signing key private and backed up. The provisional application ID is `app.hibi.planner`; confirm it before publishing.

## What is ready

- Generated Android native project, reproducible dependency lockfile, bundled web build and sync commands.
- Original two-note `public/sounds/hibi-chime.wav`, also copied into Android raw resources for the next notification stage.
- Web notifications can play the chime in a visible, signed-in app after explicit audio permission through a tap. The worker silences the system sound only if the page confirms playback. Otherwise it requests the normal system sound. Browsers may require another tap after reopening.

## Next stages

- Native notification permission, device registration and Android notification channel using `hibi_chime.wav`. Web Push subscriptions are browser subscriptions and are not native FCM tokens; the native screen intentionally does not claim these work yet.
- Native scheduled reminders and their cancellation when tasks change or the account signs out; test app-closed delivery and custom sound on a device.
- Android back navigation, app icon/splash assets, secure session storage, WhatsApp share handling and signed APK testing.
- iOS native project/build requires macOS/Xcode or a suitable hosted builder, with Apple signing/distribution requirements.

No APK or iPhone application has been built or device-tested at this stage. Native background notifications are not implemented yet.
