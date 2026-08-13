# Virtual Eye — Technology Stack

## Purpose

Virtual Eye is a privacy-focused assistive-vision mobile application. It uses the device camera to understand the surrounding scene and reads the result aloud. This document describes the stack that exists in the repository today and identifies the platform capabilities that the planned features will need.

## Stack at a glance

| Layer | Technology | Current role |
| --- | --- | --- |
| App platform | Expo SDK `~57.0.12` | Project tooling, native module integration, development server, and builds |
| Mobile framework | React Native `0.86.2` | Cross-platform native UI and device APIs |
| UI library | React Native core components | Screens, buttons, text, layout, accessibility, and styling |
| Language | TypeScript `~6.0.3` | Strictly typed application code |
| JavaScript runtime | React `19.2.3` | Component rendering and hooks |
| Camera | `expo-camera` `~57.0.3` | Camera permission handling, preview, and still-frame capture |
| Scene understanding | `@react-native-ml-kit/image-labeling` `2.0.0` | On-device labels for visible scene elements |
| Spoken output | `expo-speech` `~57.0.1` | Text-to-speech for scene captions and repeated announcements |
| System UI | `expo-status-bar` `~57.0.1` and `expo-system-ui` `~57.0.2` | Status-bar and system-level UI integration |
| App configuration | `app.json` | App identity, permissions, platform settings, and Expo plugins |
| Android distribution | EAS preview profile | Internal APK builds |

The versions above come from `package.json`; they should be treated as the source of truth when adding compatible native packages.

## Current application architecture

The current application is intentionally small and is bootstrapped through `index.ts` using Expo's `registerRootComponent`. `App.tsx` currently contains both major UI states:

1. **Welcome screen** — product introduction, privacy note, permission error handling, and the primary `START CAMERA` action.
2. **Camera screen** — live camera preview, scan status, latest caption, `SPEAK AGAIN`, and the auto-read toggle.

The screen switch is currently a local `cameraActive` state rather than a navigation library. Most camera behavior, scene-caption generation, speech output, and styles are also in `App.tsx`. This is suitable for the current prototype, but the planned OCR and voice-navigation features should be separated into screens and services before the file grows further.

## Camera and scene-labeling flow

The current camera pipeline is:

1. Request camera permission with `useCameraPermissions`.
2. Render an `expo-camera` `CameraView` using the rear camera.
3. After the camera is ready, capture a still frame immediately and approximately every 3.2 seconds.
4. Pass the local image URI to ML Kit image labeling on the device.
5. Filter and normalize labels, then turn the useful labels into a short natural-language caption.
6. Display the caption and read it through `expo-speech` when auto-read is enabled.

Captures use reduced image quality and disable the shutter sound/animation so automatic scans stay quiet. The current pipeline is local: it does not require a vision API key or a network captioning service.

### Current ML capability boundaries

`@react-native-ml-kit/image-labeling` identifies likely labels such as people, phones, rooms, or mirrors. It does **not** currently provide:

- Optical character recognition (OCR) or reliable reading of text;
- Bounding boxes suitable for precise obstacle localization;
- Depth sensing or reliable distance estimation;
- A navigation route, GPS hazard database, or a guarantee that a wall is ahead.

Those limitations must be considered when implementing obstacle warnings and the requested “100 meters” example.

## Audio and accessibility

`expo-speech` is used for spoken output. Existing behavior includes automatic caption announcements, a `SPEAK AGAIN` action, and an auto-read switch. `expo-speech` is a text-to-speech library; it does not convert microphone audio into text and therefore cannot implement voice commands by itself.

The existing controls use React Native accessibility labels, roles, hints, live-region behavior, and readable text. These conventions should continue on every new screen. Voice feedback should complement, rather than replace, visible focus states and accessible controls.

## Platform configuration

`app.json` currently configures:

- Portrait orientation and dark user-interface styling;
- Android and iOS application identifiers;
- The `expo-camera` plugin and camera permission text;
- `recordAudioAndroid: false`, because microphone input is not implemented yet;
- The `virtualeye` URL scheme and app icons.

Adding speech recognition will require a deliberate microphone-permission update and a native rebuild. Any iOS microphone permission text and Android permission configuration should be added through the Expo configuration/plugin used by the selected library, not by silently relying on a web-only implementation.

## Development and verification commands

| Command | Purpose |
| --- | --- |
| `npm run start` | Start the Expo development server |
| `npm run web` | Run the web bundle; native camera and ML behavior requires a native Android build |
| `npm run android` | Run the Android native app locally |
| `npm run ios` | Run the iOS native app locally when the local iOS toolchain is available |
| `npm run build:android` | Start the configured EAS preview APK build |
| `npx tsc --noEmit` | Run the strict TypeScript check |
| `npx expo export --platform android` | Verify that the Android JavaScript bundle exports successfully |

There is currently no test script in `package.json`. New services such as command parsing and caption/warning policy should be written so that their pure logic can be tested without a camera or native device.

Native Android files are generated by Expo prebuild and are intentionally ignored by git. Native-dependent changes must be verified with a rebuilt Android development client or APK; a web preview alone is not sufficient.

## Proposed additions for the next features

The following capabilities are **not installed yet** and need compatibility checks against Expo SDK 57 before implementation:

- **OCR:** an Expo-compatible native text-recognition module, preferably using on-device ML Kit text recognition. The selected package must support the project’s Android build and the languages required by the team.
- **Voice commands:** a speech-to-text/voice-recognition module. It must expose microphone permissions, recognition lifecycle events, partial/final transcripts, and a usable Android native build path. `expo-speech` remains the output layer.
- **Obstacle warnings:** an object-detection model plus depth or another calibrated distance source. Ordinary image labeling alone is not sufficient for safe distance warnings.
- **Navigation:** a screen-navigation solution, such as a native stack from React Navigation or Expo Router. The repository currently has no navigation dependency, so the team should choose one before splitting the app into modular screens.

For every native addition, confirm Expo SDK compatibility, Android/iOS permission behavior, whether it works offline, and whether a development-client/native rebuild is required. Do not add a package to `package.json` until that evaluation is complete.

## Privacy and safety baseline

Camera images and recognized text should remain on the device unless a future product decision explicitly requires a network service and obtains user consent. Microphone use must have a visible listening state and a clear stop action. Obstacle announcements are assistive guidance, not a replacement for a cane, guide dog, human assistance, or other safety equipment; distance claims must be qualified unless they come from a validated sensor/data source.
