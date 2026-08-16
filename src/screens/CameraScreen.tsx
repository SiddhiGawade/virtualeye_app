import ImageLabeling, { type Label } from '@react-native-ml-kit/image-labeling';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVoiceCommands } from '../hooks/useVoiceCommands';

const C = {
    bg: '#060E1A',
    surface: '#0C1929',
    surfaceHigh: '#112236',
    text: '#F0F6FF',
    textSub: '#8BA0B8',
    textDim: '#4F6478',
    accent: '#5EEAD4',
    accentDim: '#0D3330',
    accentSoft: '#A7F3E8',
    border: '#1A2E42',
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

    useFocusEffect(
        useCallback(() => {
            setVoiceEnabled(true);
            return () => setVoiceEnabled(false);
        }, [])
    );

    useVoiceCommands(voiceEnabled, useCallback((intent) => {
        switch (intent) {
            case 'GO_HOME':
            case 'STOP_CAMERA': stopAndGoBack(); break;
            case 'STOP_SPEECH': void Speech.stop(); break;
            case 'SPEAK_AGAIN':
                if (caption && caption !== WAITING_CAPTION) {
                    void Speech.stop();
                    Speech.speak(caption, { rate: 0.92, pitch: 1 });
                } else {
                    void captureFrame();
                }
                break;
            case 'AUTO_READ_ON': setAutoRead(true); break;
            case 'AUTO_READ_OFF': setAutoRead(false); break;
            default: break;
        }
    }, [caption, captureFrame, stopAndGoBack]));

    useEffect(() => { requestPermission(); }, [requestPermission]);

    useEffect(() => {
        if (!cameraReady) return;
        void captureFrame();
        const interval = setInterval(() => void captureFrame(), FRAME_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [cameraReady, captureFrame]);

    useEffect(() => {
        return () => { activeRef.current = false; void Speech.stop(); };
    }, []);

    return (
        <SafeAreaView style={s.safe}>
            {/* Header */}
            <View style={s.header}>
                <Pressable
                    accessibilityLabel="Stop camera"
                    accessibilityRole="button"
                    onPress={stopAndGoBack}
                    style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
                >
                    <Text style={s.backBtnText}>← END</Text>
                </Pressable>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>VIRTUAL EYE</Text>
                    <Text style={s.headerSub}>LIVE SCENE CAPTION</Text>
                </View>
                <View style={[s.liveBadge]}>
                    <View style={[s.liveDot, processing && s.liveDotProcessing]} />
                    <Text style={s.liveBadgeText}>{processing ? 'READING' : 'LIVE'}</Text>
                </View>
            </View>

            {/* Camera */}
            <View style={s.cameraWrap}>
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
                {/* Overlay */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={s.scanChip}>
                        {processing
                            ? <ActivityIndicator color={C.accent} size="small" />
                            : <View style={s.scanDot} />}
                        <Text style={s.scanChipText}>{processing ? 'ANALYZING' : 'SCANNING'}</Text>
                    </View>
                    {/* Corner guides */}
                    <View style={s.corners}>
                        <View style={[s.corner, s.cTL]} />
                        <View style={[s.corner, s.cTR]} />
                        <View style={[s.corner, s.cBL]} />
                        <View style={[s.corner, s.cBR]} />
                    </View>
                </View>
            </View>

            {/* Caption panel */}
            <View style={s.panel}>
                <View style={s.panelMeta}>
                    <View>
                        <Text style={s.panelLabel}>LATEST CAPTION</Text>
                        <Text style={s.panelTime}>
                            {lastScan ? `Analyzed at ${lastScan}` : 'Waiting for first frame...'}
                        </Text>
                    </View>
                    <View style={s.readyChip}>
                        <View style={[s.readyDot, processing && s.readyDotBusy]} />
                        <Text style={[s.readyText, processing && s.readyTextBusy]}>
                            {processing ? 'BUSY' : 'READY'}
                        </Text>
                    </View>
                </View>

                <Text accessibilityLiveRegion="polite" style={s.captionText} numberOfLines={4}>
                    {caption}
                </Text>

                <View style={s.actions}>
                    <Pressable
                        accessibilityLabel="Read this caption aloud"
                        accessibilityRole="button"
                        onPress={() => {
                            lastSpokenCaptionRef.current = caption;
                            void Speech.stop();
                            Speech.speak(caption, { rate: 0.92, pitch: 1 });
                        }}
                        style={({ pressed }) => [s.actionBtn, pressed && s.pressed]}
                    >
                        <Text style={s.actionBtnText}>SPEAK AGAIN</Text>
                    </Pressable>
                    <Pressable
                        accessibilityLabel={autoRead ? 'Turn auto read off' : 'Turn auto read on'}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: autoRead }}
                        onPress={() => setAutoRead(v => !v)}
                        style={({ pressed }) => [s.actionBtn, s.actionBtnFlex, autoRead && s.actionBtnActive, pressed && s.pressed]}
                    >
                        <View style={[s.toggleDot, autoRead && s.toggleDotOn]} />
                        <Text style={[s.actionBtnText, autoRead && s.actionBtnTextActive]}>
                            AUTO-READ {autoRead ? 'ON' : 'OFF'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, height: 64 },
    backBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    backBtnText: { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    pressed: { opacity: 0.7 },
    headerCenter: { alignItems: 'center' },
    headerTitle: { color: C.text, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    headerSub: { color: C.textDim, fontSize: 9, fontWeight: '600', letterSpacing: 1.2, marginTop: 3 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceHigh, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
    liveDotProcessing: { backgroundColor: '#F4C97B' },
    liveBadgeText: { color: C.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1 },

    cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
    scanChip: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', marginTop: 18, backgroundColor: 'rgba(6,14,26,0.8)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    scanDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
    scanChipText: { color: C.accentSoft, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
    corners: { ...StyleSheet.absoluteFillObject, margin: 28 },
    corner: { position: 'absolute', width: 26, height: 26, borderColor: C.accent },
    cTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 7 },
    cTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 7 },
    cBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 7 },
    cBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 7 },

    panel: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
    panelMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    panelLabel: { color: C.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1.6 },
    panelTime: { color: C.textDim, fontSize: 11, marginTop: 4 },
    readyChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
    readyDotBusy: { backgroundColor: '#F4C97B' },
    readyText: { color: C.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    readyTextBusy: { color: '#F4C97B' },
    captionText: { color: C.text, fontSize: 17, fontWeight: '500', lineHeight: 26, marginTop: 14, minHeight: 52 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    actionBtn: { alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, height: 44, justifyContent: 'center', paddingHorizontal: 14, flexDirection: 'row', gap: 8 },
    actionBtnFlex: { flex: 1 },
    actionBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
    actionBtnText: { color: C.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
    actionBtnTextActive: { color: C.accentSoft },
    toggleDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: C.textDim },
    toggleDotOn: { backgroundColor: C.accent, borderColor: C.accent },
});
