import ImageLabeling, { type Label } from '@react-native-ml-kit/image-labeling';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const COLORS = {
    background: '#07111F',
    surface: '#0D1C2F',
    surfaceRaised: '#132640',
    text: '#F6FAFF',
    textMuted: '#9CAEC4',
    textDim: '#6E829B',
    accent: '#74E2D0',
    accentSoft: '#B7F3E9',
    accentDark: '#163E3A',
    border: '#213752',
};

const FRAME_INTERVAL_MS = 3200;
const MAX_CAPTION_LENGTH = 320;
const WAITING_CAPTION = 'Watching the scene for details...';
const NO_SCENE_CAPTION = 'I cannot get a clear understanding of the scene yet. Hold steady and try again.';

const IGNORED_LABELS = new Set([
    'arm', 'body', 'ceiling', 'clothing', 'design', 'entity', 'face', 'finger', 'floor',
    'font', 'hair', 'hand', 'head', 'human body', 'image', 'indoor', 'lighting', 'object',
    'pattern', 'photo', 'photograph', 'picture', 'rectangle', 'skin', 'sleeve', 'text', 'wall',
]);

const LABEL_ALIASES: Record<string, string> = {
    bathroom: 'bathroom', cell: 'mobile phone', 'cell phone': 'mobile phone',
    girl: 'girl', human: 'person', man: 'man', mirror: 'mirror', mobile: 'mobile phone',
    'mobile phone': 'mobile phone', people: 'people', person: 'person',
    phone: 'mobile phone', room: 'room', selfie: 'selfie',
    smartphone: 'mobile phone', woman: 'woman',
};

function normalizeLabel(text: string) {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getLabelFamily(label: string) {
    if (label.includes('phone') || label.includes('smartphone') || label === 'cell' || label === 'mobile') return 'phone';
    if (['girl', 'man', 'woman', 'person', 'people', 'human'].some(v => label.includes(v))) return 'person';
    if (label.includes('mirror')) return 'mirror';
    return label;
}

function addArticle(phrase: string) {
    if (phrase === 'people' || phrase.startsWith('some ')) return phrase;
    if (/^(a|an|the) /.test(phrase)) return phrase;
    return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function buildSceneCaption(labels: Label[]) {
    const seenFamilies = new Set<string>();
    const meaningfulLabels: string[] = [];

    [...labels]
        .filter(l => l.confidence >= 0.3)
        .sort((a, b) => b.confidence - a.confidence)
        .forEach(label => {
            const norm = normalizeLabel(label.text);
            const phrase = LABEL_ALIASES[norm] ?? norm;
            const family = getLabelFamily(norm);
            if (!norm || IGNORED_LABELS.has(norm) || seenFamilies.has(family) || meaningfulLabels.includes(phrase)) return;
            seenFamilies.add(family);
            meaningfulLabels.push(phrase);
        });

    if (meaningfulLabels.length === 0) return NO_SCENE_CAPTION;

    const person = meaningfulLabels.find(l => ['girl', 'man', 'people', 'person', 'woman'].includes(l));
    const hasPhone = meaningfulLabels.includes('mobile phone');
    const hasMirror = meaningfulLabels.includes('mirror');
    const place = meaningfulLabels.find(l => ['bathroom', 'room'].includes(l));

    let caption: string;
    if (person && hasPhone) {
        const location = hasMirror ? ' in front of a mirror' : place ? ` in a ${place}` : '';
        caption = `I can see ${addArticle(person)} holding a mobile phone${location}.`;
    } else if (person && hasMirror) {
        caption = `I can see ${addArticle(person)} in front of a mirror.`;
    } else {
        const items = meaningfulLabels.slice(0, 4).map(addArticle);
        const list = items.length === 1 ? items[0]
            : items.length === 2 ? `${items[0]} and ${items[1]}`
                : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
        caption = `I can see ${list}.`;
    }

    return caption.length > MAX_CAPTION_LENGTH
        ? `${caption.slice(0, MAX_CAPTION_LENGTH - 1).trimEnd()}…`
        : caption;
}

export default function CameraScreen() {
    const router = useRouter();

    const [, requestPermission] = useCameraPermissions();
    const [cameraReady, setCameraReady] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [autoRead, setAutoRead] = useState(false);
    const [caption, setCaption] = useState(WAITING_CAPTION);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(false);

    const cameraRef = useRef<CameraView>(null);
    const activeRef = useRef(true);
    const cameraReadyRef = useRef(false);
    const processingRef = useRef(false);
    const lastSpokenCaptionRef = useRef('');

    const announceCaption = useCallback((nextCaption: string, shouldSpeak = true) => {
        setCaption(nextCaption);
        if (shouldSpeak && autoRead && nextCaption !== lastSpokenCaptionRef.current) {
            lastSpokenCaptionRef.current = nextCaption;
            void Speech.stop();
            Speech.speak(nextCaption, { rate: 0.92, pitch: 1 });
        }
    }, [autoRead]);

    const captureFrame = useCallback(async () => {
        if (!activeRef.current || !cameraReadyRef.current || processingRef.current || !cameraRef.current) return;
        processingRef.current = true;
        setProcessing(true);
        try {
            const picture = await cameraRef.current.takePictureAsync({ quality: 0.4, shutterSound: false, skipProcessing: false });
            if (!picture || !activeRef.current) return;
            const labels = await ImageLabeling.label(picture.uri);
            if (!activeRef.current) return;
            announceCaption(buildSceneCaption(labels), true);
            setLastScan(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch {
            if (activeRef.current) announceCaption('I could not understand this scene yet. Hold steady and try again.', true);
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [announceCaption]);

    const stopAndGoBack = useCallback(() => {
        activeRef.current = false;
        void Speech.stop();
        router.back();
    }, [router]);

    // Enable voice only when screen is focused
    useFocusEffect(
        useCallback(() => {
            setVoiceEnabled(true);
            return () => setVoiceEnabled(false);
        }, [])
    );

    useVoiceCommands(voiceEnabled, useCallback((intent: any) => {
        switch (intent) {
            case 'GO_HOME':
            case 'STOP_CAMERA':
                stopAndGoBack();
                break;
            case 'STOP_SPEECH':
                void Speech.stop();
                break;
            case 'SPEAK_AGAIN':
                if (caption && caption !== WAITING_CAPTION) {
                    void Speech.stop();
                    Speech.speak(caption, { rate: 0.92, pitch: 1 });
                } else {
                    void captureFrame();
                }
                break;
            case 'AUTO_READ_ON':
                setAutoRead(true);
                break;
            case 'AUTO_READ_OFF':
                setAutoRead(false);
                break;
            default:
                break;
        }
    }, [caption, captureFrame, stopAndGoBack]));

    useEffect(() => {
        requestPermission();
    }, [requestPermission]);

    useEffect(() => {
        if (!cameraReady) return;
        void captureFrame();
        const interval = setInterval(() => void captureFrame(), FRAME_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [cameraReady, captureFrame]);

    useEffect(() => {
        return () => {
            activeRef.current = false;
            void Speech.stop();
        };
    }, []);

    return (
        <SafeAreaView style={styles.screen}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    accessibilityLabel="Stop camera"
                    accessibilityRole="button"
                    onPress={stopAndGoBack}
                    style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                >
                    <Text style={styles.headerButtonText}>END</Text>
                </Pressable>
                <View style={styles.titleGroup}>
                    <Text style={styles.title}>VIRTUAL EYE</Text>
                    <Text style={styles.subtitle}>LIVE SCENE CAPTION</Text>
                </View>
                <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
            </View>

            {/* Camera */}
            <View style={styles.cameraFrame}>
                <CameraView
                    accessibilityLabel="Live camera preview"
                    animateShutter={false}
                    facing="back"
                    mode="picture"
                    onCameraReady={() => { cameraReadyRef.current = true; setCameraReady(true); }}
                    onMountError={() => { cameraReadyRef.current = false; setCameraReady(false); }}
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={styles.scanStatus}>
                        <View style={styles.scanDot} />
                        <Text style={styles.scanText}>{processing ? 'ANALYZING FRAME' : 'SCANNING'}</Text>
                    </View>
                </View>
            </View>

            {/* Caption Panel */}
            <View style={styles.captionPanel}>
                <View style={styles.captionHeader}>
                    <View>
                        <Text style={styles.captionEyebrow}>LATEST CAPTION</Text>
                        <Text style={styles.captionMeta}>
                            {lastScan ? `FRAME ANALYZED AT ${lastScan}` : 'WAITING FOR FIRST FRAME'}
                        </Text>
                    </View>
                    {processing
                        ? <ActivityIndicator color={COLORS.accent} size="small" />
                        : <View style={styles.readyBadge}><View style={styles.readyDot} /><Text style={styles.readyText}>READY</Text></View>
                    }
                </View>

                <Text accessibilityLiveRegion="polite" style={styles.captionText} numberOfLines={4}>
                    {caption}
                </Text>

                <View style={styles.actions}>
                    <Pressable
                        accessibilityLabel="Read this caption aloud"
                        accessibilityRole="button"
                        onPress={() => { lastSpokenCaptionRef.current = caption; void Speech.stop(); Speech.speak(caption, { rate: 0.92, pitch: 1 }); }}
                        style={({ pressed }) => [styles.speakBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.speakBtnText}>SPEAK AGAIN</Text>
                    </Pressable>
                    <Pressable
                        accessibilityLabel={autoRead ? 'Turn auto read off' : 'Turn auto read on'}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: autoRead }}
                        onPress={() => setAutoRead(v => !v)}
                        style={({ pressed }) => [styles.autoReadBtn, autoRead && styles.autoReadActive, pressed && styles.pressed]}
                    >
                        <View style={[styles.autoReadDot, autoRead && styles.autoReadDotActive]} />
                        <Text style={[styles.autoReadText, autoRead && styles.autoReadTextActive]}>
                            AUTO-READ {autoRead ? 'ON' : 'OFF'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: COLORS.background },
    header: { alignItems: 'center', flexDirection: 'row', height: 70, justifyContent: 'space-between', paddingHorizontal: 18 },
    headerButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 9, borderWidth: 1, height: 34, justifyContent: 'center', width: 55 },
    headerButtonText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
    pressed: { opacity: 0.72 },
    titleGroup: { alignItems: 'center' },
    title: { color: COLORS.text, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
    subtitle: { color: COLORS.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginTop: 4 },
    liveBadge: { alignItems: 'center', backgroundColor: COLORS.surfaceRaised, borderRadius: 9, flexDirection: 'row', gap: 6, height: 34, justifyContent: 'center', paddingHorizontal: 10 },
    liveDot: { backgroundColor: COLORS.accent, borderRadius: 4, height: 7, width: 7 },
    liveBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    cameraFrame: { backgroundColor: '#000', flex: 1, overflow: 'hidden' },
    scanStatus: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(7,17,31,0.75)', borderRadius: 10, flexDirection: 'row', gap: 7, marginTop: 18, paddingHorizontal: 12, paddingVertical: 8 },
    scanDot: { backgroundColor: COLORS.accent, borderRadius: 4, height: 7, width: 7 },
    scanText: { color: COLORS.accentSoft, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
    captionPanel: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 17 },
    captionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    captionEyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.7 },
    captionMeta: { color: COLORS.textDim, fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginTop: 5 },
    readyBadge: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    readyDot: { backgroundColor: COLORS.accent, borderRadius: 4, height: 7, width: 7 },
    readyText: { color: COLORS.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    captionText: { color: COLORS.text, fontSize: 18, fontWeight: '500', lineHeight: 26, marginTop: 15, minHeight: 52 },
    actions: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: 17, paddingTop: 16 },
    speakBtn: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, height: 42, justifyContent: 'center', paddingHorizontal: 13 },
    speakBtnText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
    autoReadBtn: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 10, flex: 1, flexDirection: 'row', gap: 8, height: 42, justifyContent: 'center' },
    autoReadActive: { backgroundColor: COLORS.accentDark, borderColor: COLORS.accentDark },
    autoReadDot: { borderColor: COLORS.textDim, borderRadius: 4, borderWidth: 1, height: 7, width: 7 },
    autoReadDotActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    autoReadText: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
    autoReadTextActive: { color: COLORS.accentSoft },
});
