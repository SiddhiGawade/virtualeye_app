# Virtual Eye project notes

- This is an Expo SDK 57 React Native app.
- `npm run start` launches the Expo development server.
- `npm run web` runs the web bundle; camera/scene-labeling behavior requires a native Android build.
- `npx tsc --noEmit` is the TypeScript check.
- `npx expo export --platform android` verifies the Android JavaScript bundle.
- Native Android files are generated with `npx expo prebuild --platform android` and are intentionally ignored by git.
- The installable arm64 Android APK is generated at `VirtualEye.apk` by running `assembleRelease` from `android` with `-PreactNativeArchitectures=arm64-v8a`.
- The camera scans a still frame about every 3.2 seconds and uses on-device ML Kit image labeling to describe scene elements; no vision API key or network caption service is required.
- Camera captures pass `shutterSound: false` and the preview uses `animateShutter={false}` so automated scans stay quiet.
