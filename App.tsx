import ImageLabeling, { type Label } from '@react-native-ml-kit/image-labeling';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const COLORS = {
  background: '#07111F',
  surface: '#0D1C2F',
  surfaceRaised: '#132640',
  surfaceMuted: '#102238',
  text: '#F6FAFF',
  textMuted: '#9CAEC4',
  textDim: '#6E829B',
  accent: '#74E2D0',
  accentSoft: '#B7F3E9',
  accentDark: '#163E3A',
  warning: '#F4C97B',
  border: '#213752',
  white: '#FFFFFF',
};

const FRAME_INTERVAL_MS = 3200;
const MAX_CAPTION_LENGTH = 320;
const INITIAL_CAPTION =
  'Point the camera at the world around you. I will describe what I see aloud.';
const WAITING_CAPTION = 'Watching the scene for details...';
const NO_SCENE_CAPTION =
  'I cannot get a clear understanding of the scene yet. Hold steady and try again.';

const IGNORED_LABELS = new Set([
  'arm',
  'body',
  'ceiling',
  'clothing',
  'design',
  'entity',
  'face',
  'finger',
  'floor',
  'font',
  'hair',
  'hand',
  'head',
  'human body',
  'image',
  'indoor',
  'lighting',
  'object',
  'pattern',
  'photo',
  'photograph',
  'picture',
  'rectangle',
  'skin',
  'sleeve',
  'text',
  'wall',
]);

const LABEL_ALIASES: Record<string, string> = {
  bathroom: 'bathroom',
  cell: 'mobile phone',
  'cell phone': 'mobile phone',
  girl: 'girl',
  human: 'person',
  man: 'man',
  mirror: 'mirror',
  mobile: 'mobile phone',
  'mobile phone': 'mobile phone',
  people: 'people',
  person: 'person',
  phone: 'mobile phone',
  room: 'room',
  selfie: 'selfie',
  smartphone: 'mobile phone',
  woman: 'woman',
};

function normalizeLabel(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getLabelFamily(label: string) {
  if (
    label.includes('phone') ||
    label.includes('smartphone') ||
    label === 'cell' ||
    label === 'mobile'
  ) {
    return 'phone';
  }

  if (
    ['girl', 'man', 'woman', 'person', 'people', 'human'].some((value) =>
      label.includes(value),
    )
  ) {
    return 'person';
  }

  if (label.includes('mirror')) {
    return 'mirror';
  }

  return label;
}

function addArticle(phrase: string) {
  if (phrase === 'people' || phrase.startsWith('some ')) {
    return phrase;
  }

  if (/^(a|an|the) /.test(phrase)) {
    return phrase;
  }

  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function buildSceneCaption(labels: Label[]) {
  const seenFamilies = new Set<string>();
  const meaningfulLabels: string[] = [];

  [...labels]
    .filter((label) => label.confidence >= 0.3)
    .sort((first, second) => second.confidence - first.confidence)
    .forEach((label) => {
      const normalizedLabel = normalizeLabel(label.text);
      const phrase = LABEL_ALIASES[normalizedLabel] ?? normalizedLabel;
      const family = getLabelFamily(normalizedLabel);

      if (
        !normalizedLabel ||
        IGNORED_LABELS.has(normalizedLabel) ||
        seenFamilies.has(family) ||
        meaningfulLabels.includes(phrase)
      ) {
        return;
      }

      seenFamilies.add(family);
      meaningfulLabels.push(phrase);
    });

  if (meaningfulLabels.length === 0) {
    return NO_SCENE_CAPTION;
  }

  const person = meaningfulLabels.find((label) =>
    ['girl', 'man', 'people', 'person', 'woman'].includes(label),
  );
  const hasPhone = meaningfulLabels.includes('mobile phone');
  const hasMirror = meaningfulLabels.includes('mirror');
  const place = meaningfulLabels.find((label) =>
    ['bathroom', 'room'].includes(label),
  );

  let caption: string;

  if (person && hasPhone) {
    const location = hasMirror
      ? ' in front of a mirror'
      : place
        ? ` in a ${place}`
        : '';
    caption = `I can see ${addArticle(person)} holding a mobile phone${location}.`;
  } else if (person && hasMirror) {
    caption = `I can see ${addArticle(person)} in front of a mirror.`;
  } else {
    const visibleItems = meaningfulLabels.slice(0, 4).map(addArticle);
    const itemList =
      visibleItems.length === 1
        ? visibleItems[0]
        : visibleItems.length === 2
          ? `${visibleItems[0]} and ${visibleItems[1]}`
          : `${visibleItems.slice(0, -1).join(', ')}, and ${visibleItems[visibleItems.length - 1]}`;
    caption = `I can see ${itemList}.`;
  }

  return caption.length > MAX_CAPTION_LENGTH
    ? `${caption.slice(0, MAX_CAPTION_LENGTH - 1).trimEnd()}…`
    : caption;
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const [caption, setCaption] = useState(INITIAL_CAPTION);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const activeRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const processingRef = useRef(false);
  const lastSpokenCaptionRef = useRef('');

  const announceCaption = useCallback(
    (nextCaption: string, shouldSpeak = true) => {
      setCaption(nextCaption);

      if (
        shouldSpeak &&
        autoRead &&
        nextCaption !== lastSpokenCaptionRef.current
      ) {
        lastSpokenCaptionRef.current = nextCaption;
        void Speech.stop();
        Speech.speak(nextCaption, { rate: 0.92, pitch: 1 });
      }
    },
    [autoRead],
  );

  const captureFrame = useCallback(async () => {
    if (
      !activeRef.current ||
      !cameraReadyRef.current ||
      processingRef.current ||
      !cameraRef.current
    ) {
      return;
    }

    processingRef.current = true;
    setProcessing(true);

    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        shutterSound: false,
        skipProcessing: false,
      });

      if (!picture || !activeRef.current) {
        return;
      }

      const labels = await ImageLabeling.label(picture.uri);
      const nextCaption = buildSceneCaption(labels);

      if (!activeRef.current) {
        return;
      }

      announceCaption(nextCaption, true);
      setLastScan(new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }));
    } catch {
      if (activeRef.current) {
        announceCaption(
          'I could not understand this scene yet. Hold steady and try again.',
          true,
        );
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [announceCaption]);

  useEffect(() => {
    if (!cameraActive || !cameraReady) {
      return undefined;
    }

    void captureFrame();
    const interval = setInterval(() => {
      void captureFrame();
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [cameraActive, cameraReady, captureFrame]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      void Speech.stop();
    };
  }, []);

  const startCamera = async () => {
    setPermissionError(null);

    if (!permission?.granted) {
      const response = await requestPermission();

      if (!response.granted) {
        setPermissionError(
          response.canAskAgain
            ? 'Camera permission is needed to start Virtual Eye.'
            : 'Camera permission is blocked. Open Settings to allow access.',
        );
        return;
      }
    }

    activeRef.current = true;
    cameraReadyRef.current = false;
    lastSpokenCaptionRef.current = '';
    setCaption(WAITING_CAPTION);
    setLastScan(null);
    setCameraReady(false);
    setCameraActive(true);
  };

  const stopCamera = () => {
    activeRef.current = false;
    cameraReadyRef.current = false;
    processingRef.current = false;
    void Speech.stop();
    setCameraReady(false);
    setCameraActive(false);
    setCaption(INITIAL_CAPTION);
    setLastScan(null);
  };

  const speakCurrentCaption = () => {
    lastSpokenCaptionRef.current = caption;
    void Speech.stop();
    Speech.speak(caption, { rate: 0.92, pitch: 1 });
  };

  const openSettings = () => {
    void Linking.openSettings();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {!cameraActive ? (
        <View style={styles.welcomeScreen}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkInner} />
            </View>
            <Text style={styles.brandName}>VIRTUAL EYE</Text>
          </View>

          <View style={styles.welcomeContent}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowLine} />
              <Text style={styles.eyebrow}>PERSONAL ASSISTIVE VISION</Text>
            </View>
            <Text style={styles.welcomeTitle}>
              See what is{`\n`}
              <Text style={styles.welcomeTitleAccent}>in front of you.</Text>
            </Text>
            <Text style={styles.welcomeDescription}>
              Virtual Eye watches the live camera, understands the scene, and
              speaks the latest description so you can move through the world
              with more confidence.
            </Text>

            <View style={styles.viewfinderCard}>
              <View style={styles.viewfinderGlow} />
              <View style={styles.viewfinderCorners}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <View style={styles.viewfinderCenter}>
                <View style={styles.viewfinderCenterDot} />
                <Text style={styles.viewfinderLabel}>POINT & LISTEN</Text>
              </View>
              <View style={styles.viewfinderFooter}>
                <Text style={styles.viewfinderFooterText}>ON-DEVICE SCENE CAPTIONING</Text>
                <View style={styles.readyDot} />
              </View>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>01</Text>
                <Text style={styles.featureLabel}>PRIVATE</Text>
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>03s</Text>
                <Text style={styles.featureLabel}>FRAME DELAY</Text>
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>ON</Text>
                <Text style={styles.featureLabel}>AUTO-READ</Text>
              </View>
            </View>
          </View>

          <View style={styles.welcomeFooter}>
            <Pressable
              accessibilityHint="Requests camera access and opens the live camera"
              accessibilityLabel="Start camera"
              accessibilityRole="button"
              onPress={startCamera}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.startButtonText}>START CAMERA</Text>
              <Text style={styles.startButtonArrow}>→</Text>
            </Pressable>

            {permissionError ? (
              <View style={styles.permissionNotice}>
                <Text style={styles.permissionText}>{permissionError}</Text>
                {!permission?.canAskAgain ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={openSettings}
                    style={styles.settingsButton}
                  >
                    <Text style={styles.settingsButtonText}>OPEN SETTINGS</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={styles.privacyNote}>
                Camera access is used only while you are scanning.
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.cameraScreen}>
          <View style={styles.cameraHeader}>
            <Pressable
              accessibilityLabel="Stop camera"
              accessibilityRole="button"
              onPress={stopCamera}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.headerButtonText}>END</Text>
            </Pressable>
            <View style={styles.cameraTitleGroup}>
              <Text style={styles.cameraTitle}>VIRTUAL EYE</Text>
              <Text style={styles.cameraSubtitle}>LIVE SCENE CAPTION</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.cameraFrame}>
            <CameraView
              accessibilityLabel="Live camera preview"
              animateShutter={false}
              facing="back"
              mode="picture"
              onCameraReady={() => {
                cameraReadyRef.current = true;
                setCameraReady(true);
              }}
              onMountError={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                announceCaption('The camera could not start. Please try again.', false);
              }}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.cameraOverlay}>
              <View style={styles.scanStatus}>
                <View style={styles.scanStatusDot} />
                <Text style={styles.scanStatusText}>
                  {processing ? 'ANALYZING FRAME' : 'SCANNING'}
                </Text>
              </View>
              <View style={styles.cameraCorners}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <View style={styles.scanGuide}>
                <View style={styles.scanGuideLine} />
                <Text style={styles.scanGuideText}>HOLD STEADY</Text>
              </View>
            </View>
          </View>

          <View style={styles.captionPanel}>
            <View style={styles.captionPanelHeader}>
              <View>
                <Text style={styles.captionEyebrow}>LATEST CAPTION</Text>
                <Text style={styles.captionMeta}>
                  {lastScan ? `FRAME ANALYZED AT ${lastScan}` : 'WAITING FOR FIRST FRAME'}
                </Text>
              </View>
              {processing ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <View style={styles.readyBadge}>
                  <View style={styles.readyDot} />
                  <Text style={styles.readyBadgeText}>READY</Text>
                </View>
              )}
            </View>

            <Text
              accessibilityLiveRegion="polite"
              style={styles.captionText}
              numberOfLines={4}
            >
              {caption}
            </Text>

            <View style={styles.captionActions}>
              <Pressable
                accessibilityLabel="Read this caption aloud"
                accessibilityRole="button"
                onPress={speakCurrentCaption}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryActionText}>SPEAK AGAIN</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={autoRead ? 'Turn auto read off' : 'Turn auto read on'}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoRead }}
                onPress={() => setAutoRead((value) => !value)}
                style={({ pressed }) => [
                  styles.autoReadAction,
                  autoRead && styles.autoReadActionActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <View style={[styles.autoReadDot, autoRead && styles.autoReadDotActive]} />
                <Text
                  style={[
                    styles.autoReadActionText,
                    autoRead && styles.autoReadActionTextActive,
                  ]}
                >
                  AUTO-READ {autoRead ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  welcomeScreen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandMark: {
    alignItems: 'center',
    borderColor: COLORS.accent,
    borderRadius: 8,
    borderWidth: 2,
    height: 27,
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    width: 27,
  },
  brandMarkInner: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    height: 9,
    transform: [{ rotate: '-45deg' }],
    width: 9,
  },
  brandName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 12,
    paddingTop: 20,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 16,
  },
  eyebrowLine: {
    backgroundColor: COLORS.accent,
    height: 2,
    width: 28,
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  welcomeTitle: {
    color: COLORS.text,
    fontSize: 43,
    fontWeight: '700',
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  welcomeTitleAccent: {
    color: COLORS.accent,
  },
  welcomeDescription: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 18,
    maxWidth: 355,
  },
  viewfinderCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 22,
    height: 194,
    marginTop: 26,
    overflow: 'hidden',
    position: 'relative',
  },
  viewfinderGlow: {
    backgroundColor: COLORS.accentDark,
    borderRadius: 100,
    height: 180,
    opacity: 0.65,
    position: 'absolute',
    right: -54,
    top: -74,
    width: 180,
  },
  viewfinderCorners: {
    ...StyleSheet.absoluteFill,
    margin: 20,
  },
  viewfinderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    ...StyleSheet.absoluteFill,
  },
  viewfinderCenterDot: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    height: 15,
    marginBottom: 13,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.75,
    shadowRadius: 14,
    width: 15,
  },
  viewfinderLabel: {
    color: COLORS.accentSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  viewfinderFooter: {
    alignItems: 'center',
    bottom: 16,
    flexDirection: 'row',
    gap: 8,
    left: 20,
    position: 'absolute',
  },
  viewfinderFooterText: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 21,
  },
  featureItem: {
    flex: 1,
  },
  featureValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  featureLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 4,
  },
  featureDivider: {
    backgroundColor: COLORS.border,
    height: 30,
    width: 1,
  },
  welcomeFooter: {
    paddingBottom: 18,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 15,
    flexDirection: 'row',
    height: 62,
    justifyContent: 'space-between',
    paddingHorizontal: 23,
  },
  startButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  startButtonArrow: {
    color: COLORS.background,
    fontSize: 27,
    fontWeight: '300',
    marginTop: -2,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  privacyNote: {
    color: COLORS.textDim,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 13,
    textAlign: 'center',
  },
  permissionNotice: {
    alignItems: 'center',
    marginTop: 12,
  },
  permissionText: {
    color: COLORS.warning,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  settingsButton: {
    borderColor: COLORS.warning,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  settingsButtonText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  corner: {
    borderColor: COLORS.accent,
    height: 30,
    position: 'absolute',
    width: 30,
  },
  cornerTopLeft: {
    borderLeftWidth: 2,
    borderTopLeftRadius: 8,
    borderTopWidth: 2,
    left: 0,
    top: 0,
  },
  cornerTopRight: {
    borderRightWidth: 2,
    borderTopRightRadius: 8,
    borderTopWidth: 2,
    right: 0,
    top: 0,
  },
  cornerBottomLeft: {
    borderBottomLeftRadius: 8,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    bottom: 0,
    left: 0,
  },
  cornerBottomRight: {
    borderBottomRightRadius: 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    bottom: 0,
    right: 0,
  },
  cameraScreen: {
    flex: 1,
  },
  cameraHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 70,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerButton: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 9,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 55,
  },
  headerButtonText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  cameraTitleGroup: {
    alignItems: 'center',
  },
  cameraTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cameraSubtitle: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginTop: 4,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 9,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  liveDot: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  liveBadgeText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cameraFrame: {
    backgroundColor: '#000000',
    flex: 1,
    minHeight: 300,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
  },
  scanStatus: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(7, 17, 31, 0.75)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scanStatusDot: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  scanStatusText: {
    color: COLORS.accentSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cameraCorners: {
    ...StyleSheet.absoluteFill,
    margin: 28,
  },
  scanGuide: {
    alignItems: 'center',
    bottom: 28,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  scanGuideLine: {
    backgroundColor: COLORS.accent,
    height: 1,
    opacity: 0.85,
    width: 90,
  },
  scanGuideText: {
    color: COLORS.accentSoft,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 8,
  },
  captionPanel: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 17,
  },
  captionPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  captionEyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  captionMeta: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 5,
  },
  readyBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  readyDot: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  readyBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  captionText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26,
    marginTop: 15,
    minHeight: 52,
  },
  captionActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 17,
    paddingTop: 16,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  secondaryActionText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  autoReadAction: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    justifyContent: 'center',
  },
  autoReadActionActive: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark,
  },
  autoReadDot: {
    borderColor: COLORS.textDim,
    borderRadius: 4,
    borderWidth: 1,
    height: 7,
    width: 7,
  },
  autoReadDotActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  autoReadActionText: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  autoReadActionTextActive: {
    color: COLORS.accentSoft,
  },
});
