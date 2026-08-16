import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { recognizeText } from '../services/ocrService';

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
    warning: '#F4C97B',
    warningDim: '#2A1F0A',
};

type ScanState = 'ready' | 'capturing' | 'recognizing' | 'result' | 'no_text' | 'error';

const STATE_LABEL: Record<ScanState, string> = {
    ready: 'READY TO SCAN',
    capturing: 'CAPTURING IMAGE',
    recognizing: 'READING TEXT...',
    result: 'TEXT FOUND',
    no_text: 'NO TEXT DETECTED',
    error: 'SCAN FAILED',
};

export default function TextReaderScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [state, setState] = useState<ScanState>('ready');
    const [resultText, setResultText] = useState('');
    const cameraRef = useRef<CameraView>(null);
    const isBusy = state === 'capturing' || state === 'recognizing';

    const handleScan = async () => {
        if (!permission?.granted) {
            await requestPermission();
            return;
        }
        if (!cameraRef.current) return;
        setState('capturing');
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8, shutterSound: false, skipProcessing: false,
            });
            if (!photo) { setState('error'); return; }
            setState('recognizing');
            const result = await recognizeText(photo.uri);
            if (!result.success || !result.text.trim()) { setState('no_text'); return; }
            setResultText(result.text);
            setState('result');
        } catch {
            setState('error');
        }
    };

    const handleReadAloud = () => {
        void Speech.stop();
        Speech.speak(resultText, { rate: 0.88, pitch: 1 });
    };

    const handleScanAgain = () => {
        void Speech.stop();
        setResultText('');
        setState('ready');
    };

    const handleBack = () => {
        void Speech.stop();
        router.back();
    };

    const isWarning = state === 'no_text' || state === 'error';

    return (
        <SafeAreaView style={s.safe}>
            {/* Header */}
            <View style={s.header}>
                <Pressable
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                    onPress={handleBack}
                    style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
                >
                    <Text style={s.backBtnText}>← BACK</Text>
                </Pressable>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>TEXT READER</Text>
                    <Text style={s.headerSub}>ON-DEVICE OCR</Text>
                </View>
                <View style={s.headerRight} />
            </View>

            {/* Camera */}
            <View style={s.cameraWrap}>
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    mode="picture"
                    animateShutter={false}
                />
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={s.scanRegion}>
                        <View style={[s.corner, s.cTL]} />
                        <View style={[s.corner, s.cTR]} />
                        <View style={[s.corner, s.cBL]} />
                        <View style={[s.corner, s.cBR]} />
                        <Text style={s.scanRegionLabel}>POINT AT TEXT</Text>
                    </View>
                </View>
            </View>

            {/* Panel */}
            <View style={s.panel}>
                {/* Status row */}
                <View style={[s.statusRow, isWarning && s.statusRowWarning]}>
                    {isBusy
                        ? <ActivityIndicator color={C.accent} size="small" />
                        : <View style={[s.statusDot, isWarning && s.statusDotWarning, state === 'result' && s.statusDotReady]} />
                    }
                    <Text style={[s.statusLabel, isWarning && s.statusLabelWarning]}>
                        {STATE_LABEL[state]}
                    </Text>
                </View>

                {/* Content */}
                <ScrollView style={s.contentArea} showsVerticalScrollIndicator={false}>
                    {state === 'ready' && (
                        <Text style={s.hintText}>
                            Point the camera at any printed or handwritten text, then tap Scan Text below.
                        </Text>
                    )}
                    {(state === 'capturing' || state === 'recognizing') && (
                        <Text style={s.hintText}>Hold the camera steady...</Text>
                    )}
                    {state === 'no_text' && (
                        <Text style={s.warningText}>
                            No text was detected. Try moving closer, improving lighting, or holding steadier.
                        </Text>
                    )}
                    {state === 'error' && (
                        <Text style={s.warningText}>
                            Something went wrong processing the image. Hold steady and try again.
                        </Text>
                    )}
                    {state === 'result' && (
                        <Text style={s.resultText} accessibilityLiveRegion="polite">
                            {resultText}
                        </Text>
                    )}
                </ScrollView>

                {/* Actions */}
                <View style={s.actions}>
                    {state === 'result' ? (
                        <>
                            <Pressable
                                accessibilityLabel="Read text aloud"
                                accessibilityRole="button"
                                onPress={handleReadAloud}
                                style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
                            >
                                <Text style={s.primaryBtnText}>READ ALOUD</Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Scan again"
                                accessibilityRole="button"
                                onPress={handleScanAgain}
                                style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
                            >
                                <Text style={s.secondaryBtnText}>SCAN AGAIN</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Pressable
                            accessibilityLabel="Scan text"
                            accessibilityRole="button"
                            onPress={handleScan}
                            disabled={isBusy}
                            style={({ pressed }) => [
                                s.primaryBtn, s.fullBtn,
                                isBusy && s.disabledBtn,
                                pressed && s.pressed,
                            ]}
                        >
                            <Text style={s.primaryBtnText}>
                                {isBusy ? 'PROCESSING...' : 'SCAN TEXT'}
                            </Text>
                        </Pressable>
                    )}
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
    headerCenter: { alignItems: 'center' },
    headerTitle: { color: C.text, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    headerSub: { color: C.textDim, fontSize: 9, fontWeight: '600', letterSpacing: 1.2, marginTop: 3 },
    headerRight: { width: 68 },
    pressed: { opacity: 0.7 },

    cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
    scanRegion: {
        position: 'absolute', top: '50%', left: '50%',
        width: 280, height: 160,
        marginLeft: -140, marginTop: -80,
        alignItems: 'center', justifyContent: 'center',
        borderColor: 'rgba(94,234,212,0.3)', borderWidth: 1, borderRadius: 10,
    },
    corner: { position: 'absolute', width: 22, height: 22, borderColor: C.accent },
    cTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
    cTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
    cBL: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 },
    cBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 },
    scanRegionLabel: { color: 'rgba(94,234,212,0.6)', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },

    panel: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceHigh, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
    statusRowWarning: { backgroundColor: C.warningDim },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.textDim },
    statusDotReady: { backgroundColor: C.accent },
    statusDotWarning: { backgroundColor: C.warning },
    statusLabel: { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    statusLabelWarning: { color: C.warning },

    contentArea: { maxHeight: 100, marginBottom: 14 },
    hintText: { color: C.textSub, fontSize: 14, lineHeight: 22 },
    warningText: { color: C.warning, fontSize: 14, lineHeight: 22 },
    resultText: { color: C.text, fontSize: 15, lineHeight: 24 },

    actions: { flexDirection: 'row', gap: 10 },
    primaryBtn: { alignItems: 'center', backgroundColor: C.accent, borderRadius: 14, height: 50, justifyContent: 'center', paddingHorizontal: 22 },
    fullBtn: { flex: 1 },
    primaryBtnText: { color: C.bg, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
    secondaryBtn: { alignItems: 'center', borderColor: C.border, borderRadius: 14, borderWidth: 1, height: 50, justifyContent: 'center', paddingHorizontal: 18 },
    secondaryBtnText: { color: C.textSub, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    disabledBtn: { opacity: 0.45 },
});
