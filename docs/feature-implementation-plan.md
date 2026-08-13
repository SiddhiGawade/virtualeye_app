# Virtual Eye — Feature Implementation Plan

**Status:** Proposed roadmap for the next development phase

This document translates the requested features into implementation work for the current Virtual Eye prototype. It is intentionally explicit about platform limitations: a camera image-labeling model cannot by itself perform OCR or produce a safe, exact distance such as “a wall is 100 meters away.”

## Current baseline

The current app has one root component in `App.tsx` with two local UI states:

- A welcome screen with a `START CAMERA` button;
- A live camera screen that captures a still frame approximately every 3.2 seconds, labels it with on-device ML Kit image labeling, and speaks a generated scene caption.

Text recognition, microphone speech recognition, obstacle detection, distance estimation, and screen navigation are not implemented yet. `expo-speech` already provides text-to-speech, but it does not listen to or understand spoken commands.

## Product goals

1. Make the main screen simple: the primary action is **START CAMERA**.
2. Put OCR/text reading on its own screen instead of mixing it with scene captioning.
3. Let users navigate and control common actions by voice while the app is in the foreground.
4. Give useful obstacle warnings without presenting unvalidated measurements as facts.
5. Keep camera, microphone, and recognized content private by default and preserve accessible controls for every voice action.

## Recommended implementation order

1. Refactor the root component into modular screens and add navigation.
2. Add the Text Reader screen and its on-device OCR service.
3. Add speech recognition and a deterministic voice-command dispatcher.
4. Decide the obstacle-detection data source and build a measurable prototype.
5. Integrate, test on native Android hardware, and tune speech/warning behavior.

The first three steps can be delivered independently. Obstacle warnings require a separate feasibility decision before the team promises numeric distances.

## 1. Modular screens and navigation

### Target screens

| Screen | Responsibility | Primary actions |
| --- | --- | --- |
| `HomeScreen` | Main landing screen and feature entry point | Start Camera, open Text Reader, enter voice-command mode |
| `CameraScreen` | Existing live scene captioning flow | Stop camera, speak again, toggle auto-read |
| `TextReaderScreen` | Capture and read visible text | Capture/scan text, read result aloud, scan again, stop speaking |
| `SettingsScreen` (optional) | Permission and speech preferences | Camera/microphone guidance, auto-read and voice settings |

The home screen should not show the live camera preview. It should make `START CAMERA` the dominant action and expose Text Reader as a separate feature. Voice commands should be available from the home screen and, where safe, from the active feature screens.

### Proposed project structure

This is a target structure, not a set of files that currently exists:

```text
App.tsx
src/
  navigation/
    AppNavigator.tsx
    routeTypes.ts
  screens/
    HomeScreen.tsx
    CameraScreen.tsx
    TextReaderScreen.tsx
    SettingsScreen.tsx
  components/
    AccessibleButton.tsx
    SpeechStatus.tsx
    PermissionNotice.tsx
  services/
    cameraService.ts
    ocrService.ts
    speechService.ts
    voiceCommandService.ts
    obstacleService.ts
  hooks/
    useSceneCaption.ts
    useTextReader.ts
    useVoiceCommands.ts
  types/
    features.ts
```

The team should choose one navigation library compatible with Expo SDK 57 before starting the refactor. The current repository has no navigation dependency. Voice commands should dispatch typed intents to a single navigation/action layer rather than directly manipulating screen state in several components.

### Refactor rules

- Keep `App.tsx` limited to app providers and the navigation root.
- Move the existing camera capture loop and caption generation out of the root component without changing its behavior.
- Keep speech operations behind `speechService.ts` so scene captions, OCR results, and warnings share stop/repeat behavior.
- Keep camera and microphone permission handling close to the feature that needs each permission.
- Use typed route names and route parameters; do not navigate using arbitrary transcript strings.
- Reuse the existing dark visual language and accessibility labels.

### UI acceptance criteria

- Launching the app displays `HomeScreen` with `START CAMERA` as the main action.
- Camera captioning still works after moving to `CameraScreen`.
- Text Reader is a distinct route and does not start the scene-labeling loop.
- Back/stop actions always stop active speech and camera processing.
- Every important action has an accessibility role, label, and state where applicable.
- The current web bundle can render the navigation shell, while native-only features show a clear unsupported/platform message if necessary.

## 2. OCR and text reading

### Scope

Text Reader should capture a view containing printed or handwritten text, recognize it locally, display the result, and read it aloud on request. It should not use the existing image-labeling result as a substitute for OCR.

### Proposed flow

1. User opens **Text Reader** from the home screen or says “open text reader.”
2. The app requests camera permission if it is not already granted.
3. The screen shows a camera preview with a clear capture/scan action.
4. The app captures a still image and passes its URI to an Expo-compatible native text-recognition service.
5. The service returns recognized text, with blocks/lines or confidence metadata when supported.
6. The screen displays the recognized text and offers `READ ALOUD`, `SCAN AGAIN`, and `STOP` actions.
7. The speech service stops the previous utterance before reading new text.

### OCR implementation tasks

- [ ] Evaluate an on-device ML Kit text-recognition module compatible with Expo SDK 57 and the current Android build.
- [ ] Add the selected dependency through the package manager and rebuild the native development client.
- [ ] Implement an `ocrService` boundary that accepts an image URI and returns a typed OCR result.
- [ ] Handle portrait orientation, blurry frames, low light, and images with no detectable text.
- [ ] Consider a user-controlled crop/region of interest so the recognizer does not process unrelated content.
- [ ] Prevent duplicate announcements when consecutive scans return the same text.
- [ ] Preserve line breaks and reading order when presenting multi-line text.
- [ ] Add language selection only after the first supported-language path works reliably.
- [ ] Keep captured images and OCR output in memory unless the user explicitly asks to save them.

### OCR screen states

The screen should have explicit states for `ready`, `capturing`, `recognizing`, `result`, `no text found`, `permission denied`, and `error`. A native recognition failure must not leave the screen permanently busy or silently speak stale text.

### OCR acceptance criteria

- A user can reach Text Reader without first starting Camera mode.
- The app reads clear, in-focus text from a native Android build without a network API key.
- The recognized result is visible and can be spoken again.
- A no-text result gives an actionable message such as asking the user to move closer or hold steady.
- Repeated scans do not repeatedly speak an unchanged result unless the user requests it.
- Camera permission denial and blocked permission have clear recovery paths.
- OCR logic can be tested with fixed image fixtures or mocked service results without requiring a live camera in every test.

## 3. Voice commands and voice-driven navigation

### Important distinction

`expo-speech` is the output layer only. Voice commands need a separate speech-to-text or speech-recognition module with microphone permission and native lifecycle events. The selected module must be tested on a real Android build; a web speech API fallback must not be treated as the mobile implementation.

### Recommended first command set

| Spoken command | Intent | Expected action |
| --- | --- | --- |
| “Start camera” | `START_CAMERA` | Request permission if needed and navigate to `CameraScreen` |
| “Open text reader” / “Read text” | `OPEN_TEXT_READER` | Navigate to `TextReaderScreen` |
| “Go home” | `GO_HOME` | Stop active camera/OCR/speech work and return to `HomeScreen` |
| “Stop camera” | `STOP_CAMERA` | Stop camera capture and return to the home screen |
| “Speak again” / “Repeat” | `SPEAK_AGAIN` | Repeat the latest caption or OCR result |
| “Turn auto-read on” | `AUTO_READ_ON` | Enable automatic spoken results |
| “Turn auto-read off” | `AUTO_READ_OFF` | Disable automatic spoken results |
| “Stop speaking” | `STOP_SPEECH` | Stop the current text-to-speech utterance |
| “Help” | `HELP` | Speak the available commands |

The parser should normalize case and whitespace, support a small set of deliberate aliases, and return an `UNKNOWN` intent for anything else. Do not navigate based on arbitrary transcript text.

### Listening behavior

For the first release, voice control should work while the app is in the foreground and show an unmistakable listening/processing/off state. The team must make one explicit product decision before implementation:

- **Intentional listening:** the user activates a microphone action, then speaks a command. This is the safer privacy and battery default.
- **Foreground listening:** the app begins listening on the home screen after microphone permission is granted. This better matches a hands-free experience, but requires a persistent listening indicator and an always-available stop action.

Background listening and wake-word support should not be added as part of the initial command parser without a separate privacy, battery, and platform review.

### Voice implementation tasks

- [ ] Evaluate a speech-recognition module compatible with Expo SDK 57, Android, and the target language.
- [ ] Add microphone permission configuration only with the selected module; the current config explicitly has `recordAudioAndroid: false`.
- [ ] Implement recognition start, partial transcript, final transcript, stop, timeout, unavailable, and permission-denied states.
- [ ] Create a pure `parseVoiceCommand(transcript)` function with typed intents.
- [ ] Create one command executor that maps intents to existing button actions and typed navigation routes.
- [ ] Add spoken confirmation only when it helps; avoid speaking over the user or a current warning.
- [ ] Do not persist raw transcripts by default and do not log microphone content.
- [ ] Handle no-match and recognition errors with a short spoken and visible status message.

### Voice acceptance criteria

- Saying “start camera” from the home experience opens the same camera flow as pressing `START CAMERA`.
- Saying “open text reader” opens the dedicated OCR screen.
- The same command does not trigger duplicate navigation when partial and final transcripts both arrive.
- “Stop speaking” interrupts current text-to-speech output.
- Microphone permission denial leaves the app usable through visible controls.
- The listening state is visible, accessible, and stoppable.
- Command parsing has unit coverage for valid aliases, whitespace/case variations, unknown commands, and ambiguous input.

## 4. Obstacle warnings

### Feasibility decision required

The example “In 100 meters there is a wall” combines two different product capabilities:

1. **Immediate visual obstacle warning:** detect an object ahead and warn that it is nearby.
2. **Long-range geographic/navigation warning:** know that a wall or other hazard is located a specified distance along a route.

The current image-labeling package cannot reliably deliver either distance measurement. A normal RGB camera does not provide a trustworthy 100-meter distance estimate without additional sensing, calibration, or external data. The team must choose and document the supported scenario before implementation.

### Possible implementation paths

#### Path A — Near-field camera assistance

Use an object-detection model that provides locations/bounding boxes, then combine it with a calibrated depth source such as AR/depth sensors or another supported distance method. The output should initially use qualified phrases such as “Obstacle ahead” or “Wall nearby.” Numeric distances should be shown only after validation on the target devices.

#### Path B — Route or map hazards

Use location permission, a route provider, and a trusted hazard dataset to warn about a mapped hazard ahead. This is a navigation feature, not a direct camera measurement, and it cannot identify an arbitrary unmapped wall.

#### Path C — Staged MVP

Start with reliable object presence and direction (“obstacle ahead,” “person to the left”) without numeric distance. Add approximate distance only after a sensor/data source and an evaluation protocol are approved.

### Proposed perception pipeline

```text
Camera/sensor frame
        ↓
Object detector or hazard data source
        ↓
Tracking and confidence filtering
        ↓
Depth/distance estimator (only if validated)
        ↓
Warning policy: priority, persistence, and cooldown
        ↓
Speech and/or haptic alert
```

Obstacle processing should be independent from the slower scene-caption and OCR flows. A 3.2-second scene scan is not an adequate safety-warning loop. The obstacle pipeline must be benchmarked for latency and must never block camera controls or text reading.

### Warning-policy requirements

- Require a confidence threshold and, where possible, persistence across more than one frame before announcing.
- Prioritize the most urgent warning and suppress repeated identical announcements with a cooldown.
- Allow the user to stop speech without disabling the detector.
- Prefer short, unambiguous phrases and identify direction when the model supports it.
- Say “approximately” for estimated distances and do not state a numeric distance when the source is not validated.
- Use haptics as an optional secondary channel, not as an unexplained replacement for audio.
- Test false positives, false negatives, low light, motion blur, crowded scenes, and device differences.

### Obstacle acceptance criteria

- The supported obstacle scenario and sensor/data source are documented before coding begins.
- Warnings are produced with measured latency and documented confidence behavior on target Android devices.
- The app does not claim “100 meters” from image labeling alone.
- Duplicate warnings are throttled and speech remains understandable.
- There is a clear limitation/safety message during onboarding or settings.
- Manual field testing is completed with a safety observer; this feature must not be validated by walking into hazards.

## 5. Shared service contracts

The UI should depend on small typed service boundaries instead of native packages directly. Suggested result shapes are conceptual and should be adapted to the selected libraries:

```ts
type VoiceIntent =
  | 'START_CAMERA'
  | 'OPEN_TEXT_READER'
  | 'GO_HOME'
  | 'STOP_CAMERA'
  | 'SPEAK_AGAIN'
  | 'AUTO_READ_ON'
  | 'AUTO_READ_OFF'
  | 'STOP_SPEECH'
  | 'HELP'
  | 'UNKNOWN';

type OcrResult = {
  text: string;
  blocks?: Array<{ text: string }>;
};

type ObstacleWarning = {
  kind: string;
  direction?: 'left' | 'center' | 'right';
  distanceMeters?: number;
  confidence: number;
};
```

The exact native response types should be converted at the service boundary. This keeps screens testable and makes it possible to replace a native implementation later without rewriting navigation and UI logic.

## 6. Verification plan

### Automated checks

- Run `npx tsc --noEmit` after every module/dependency change.
- Run `npx expo export --platform android` to verify the JavaScript bundle.
- Unit-test voice command parsing, duplicate transcript suppression, OCR result formatting, and obstacle-warning cooldown/priority as pure functions.
- Add mocked service tests for permission errors, empty OCR results, recognition timeouts, and speech interruption.

### Native-device checks

- Build and run an Android development client or APK after adding any native module.
- Test camera, microphone, and location permission flows when applicable, including denial and “blocked” states.
- Test portrait orientation, low light, motion, noisy speech, speech overlap, and app background/foreground transitions.
- Confirm that camera frames, OCR results, transcripts, and location data are not unintentionally uploaded or logged.
- Check that every screen remains operable using TalkBack and visible controls.

## Delivery checklist

- [ ] Select and verify the navigation library.
- [ ] Split `App.tsx` into the navigation shell, screens, components, and services.
- [ ] Implement Text Reader with on-device OCR and spoken output.
- [ ] Select and verify the speech-recognition module and microphone permissions.
- [ ] Implement the typed voice parser and navigation/action executor.
- [ ] Decide whether obstacle warnings are near-field, route-based, or staged MVP.
- [ ] Validate the obstacle data source before adding numeric distances.
- [ ] Add automated logic tests and complete native Android verification.
- [ ] Update this plan with actual package versions and device limitations after each feature is merged.
