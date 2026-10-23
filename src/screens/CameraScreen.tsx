import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    analyzeSceneFrame,
    getSceneAnalysisConfig,
    isSceneAnalysisConfigured,
    LiveSceneAnalysisSocket,
} from '../services/sceneAnalysisService';
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

const FRAME_INTERVAL_MS = 1000;
const WAITING_CAPTION = 'Watching the live scene for details...';
const BACKEND_NOT_CONFIGURED = 'Connect the scene-analysis backend to start live captioning.';
const BACKEND_ERROR = 'The live scene-analysis backend is unavailable. Hold steady and try again.';
const SCENE_ANALYSIS_CONFIG = getSceneAnalysisConfig();

type BackendStatus = 'not_configured' | 'connecting' | 'ready' | 'error';

export default function CameraScreen() {
    const router = useRouter();
    const [, requestPermission] = useCameraPermissions();
    const [cameraReady, setCameraReady] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [autoRead, setAutoRead] = useState(false);
    const [caption, setCaption] = useState(WAITING_CAPTION);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [backendStatus, setBackendStatus] = useState<BackendStatus>(
        isSceneAnalysisConfigured()
            ? SCENE_ANALYSIS_CONFIG.wsUrl ? 'connecting' : 'ready'
            : 'not_configured'
    );

    const cameraRef = useRef<CameraView>(null);
    const sceneSocketRef = useRef<LiveSceneAnalysisSocket | null>(null);
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
        if (!isSceneAnalysisConfigured()) {
            setBackendStatus('not_configured');
            announceCaption(BACKEND_NOT_CONFIGURED, false);
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        try {
            const picture = await cameraRef.current.takePictureAsync({ quality: 0.45, shutterSound: false, skipProcessing: false });
            if (!picture || !activeRef.current) return;

            const result = SCENE_ANALYSIS_CONFIG.wsUrl
                ? await sceneSocketRef.current?.sendFrame(picture.uri)
                : await analyzeSceneFrame(picture.uri);
            if (!result || !activeRef.current) return;

            setBackendStatus('ready');
            announceCaption(result.caption, true);
            setLastScan(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scene-analysis error';
            console.warn(`[SceneAnalysis] ${message}`);
            if (activeRef.current) {
                setBackendStatus('error');
                announceCaption(BACKEND_ERROR, true);
            }
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    }, [announceCaption]);

    const stopAndGoBack = useCallback(() => {
        activeRef.current = false;
        sceneSocketRef.current?.close();
        sceneSocketRef.current = null;
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
                if (caption && caption !== WAITING_CAPTION && caption !== BACKEND_NOT_CONFIGURED) {
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

    useEffect(() => {
        if (Platform.OS !== 'web') void requestPermission();
    }, [requestPermission]);

    useEffect(() => {
        if (!cameraReady || !SCENE_ANALYSIS_CONFIG.wsUrl) return;

        const socket = new LiveSceneAnalysisSocket(SCENE_ANALYSIS_CONFIG.wsUrl);
        sceneSocketRef.current = socket;
        setBackendStatus('connecting');
        void socket.connect()
            .then(() => { if (activeRef.current) setBackendStatus('ready'); })
            .catch(() => { if (activeRef.current) setBackendStatus('error'); });

        return () => {
            socket.close();
            if (sceneSocketRef.current === socket) sceneSocketRef.current = null;
        };
    }, [cameraReady]);

    useEffect(() => {
        if (!cameraReady) return;
        if (!isSceneAnalysisConfigured()) {
            setBackendStatus('not_configured');
            announceCaption(BACKEND_NOT_CONFIGURED, false);
            return;
        }

        void captureFrame();
        const interval = setInterval(() => void captureFrame(), FRAME_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [announceCaption, cameraReady, captureFrame]);

    useEffect(() => {
        return () => {
            activeRef.current = false;
            sceneSocketRef.current?.close();
            void Speech.stop();
        };
    }, []);

    const statusLabel = processing
        ? 'READING'
        : backendStatus === 'connecting'
            ? 'CONNECTING'
            : backendStatus === 'error'
                ? 'OFFLINE'
                : backendStatus === 'not_configured'
                    ? 'SETUP'
                    : 'LIVE';
    const statusText = processing
        ? 'ANALYZING'
        : backendStatus === 'not_configured'
            ? 'BACKEND REQUIRED'
            : backendStatus === 'error'
                ? 'RECONNECTING'
                : 'SCANNING';

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
                <View style={s.liveBadge}>
                    <View style={[s.liveDot, processing && s.liveDotProcessing, backendStatus === 'error' && s.liveDotError]} />
                    <Text style={[s.liveBadgeText, backendStatus === 'error' && s.liveBadgeTextError]}>{statusLabel}</Text>
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
                        <Text style={s.scanChipText}>{statusText}</Text>
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
                        <Text style={[s.readyText, processing && s.readyTextBusy, backendStatus === 'error' && s.readyTextError]}>
                            {processing ? 'BUSY' : statusLabel}
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
    liveDotError: { backgroundColor: '#F87171' },
    liveBadgeText: { color: C.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    liveBadgeTextError: { color: '#F87171' },

    cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
    scanChip: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', marginTop: 18, backgroundColor: 'rgba(6,14,26,0.8)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    scanDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
    scanChipText: { color: C.accentSoft, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
    corners: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: 28 },
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
    readyTextError: { color: '#F87171' },
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
