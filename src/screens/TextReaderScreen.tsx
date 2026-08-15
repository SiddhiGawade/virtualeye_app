import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { recognizeText } from '../services/ocrService';

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

type ScreenState = 'ready' | 'capturing' | 'recognizing' | 'result' | 'no_text' | 'error';

export default function TextReaderScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [state, setState] = useState<ScreenState>('ready');
    const [resultText, setResultText] = useState('');
    const cameraRef = useRef<CameraView>(null);

    const handleScan = async () => {
        if (!permission?.granted) {
            await requestPermission();
            return;
        }

        if (!cameraRef.current) return;

        setState('capturing');
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                shutterSound: false,
                skipProcessing: false,
            });

            if (!photo) {
                setState('error');
                return;
            }

            setState('recognizing');
            const result = await recognizeText(photo.uri);

            if (!result.success || !result.text.trim()) {
                setState('no_text');
                return;
            }

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

    const isBusy = state === 'capturing' || state === 'recognizing';

    return (
        <SafeAreaView style={styles.safe}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                    onPress={handleBack}
                    style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                >
                    <Text style={styles.headerButtonText}>BACK</Text>
                </Pressable>
                <View style={styles.titleGroup}>
                    <Text style={styles.title}>TEXT READER</Text>
                    <Text style={styles.subtitle}>ON-DEVICE OCR</Text>
                </View>
                <View style={styles.headerRight} />
            </View>

            {/* Camera Preview */}
            <View style={styles.cameraFrame}>
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    mode="picture"
                    animateShutter={false}
                />
                {/* Scan guide overlay */}
                <View pointerEvents="none" style={styles.overlay}>
                    <View style={styles.scanBox}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        <Text style={styles.scanGuideText}>POINT AT TEXT</Text>
                    </View>
                </View>
            </View>

            {/* Bottom Panel */}
            <View style={styles.panel}>

                {/* Status */}
                <View style={styles.statusRow}>
                    <Text style={styles.panelEyebrow}>
                        {state === 'ready' && 'READY TO SCAN'}
                        {state === 'capturing' && 'CAPTURING...'}
                        {state === 'recognizing' && 'READING TEXT...'}
                        {state === 'result' && 'TEXT FOUND'}
                        {state === 'no_text' && 'NO TEXT FOUND'}
                        {state === 'error' && 'SOMETHING WENT WRONG'}
                    </Text>
                    {isBusy && <ActivityIndicator color={COLORS.accent} size="small" />}
                </View>

                {/* Result text or hint */}
                <View style={styles.resultBox}>
                    {state === 'ready' && (
                        <Text style={styles.hintText}>
                            Point the camera at printed or handwritten text, then tap Scan.
                        </Text>
                    )}
                    {state === 'no_text' && (
                        <Text style={styles.hintText}>
                            No text detected. Move closer, improve lighting, and try again.
                        </Text>
                    )}
                    {state === 'error' && (
                        <Text style={styles.hintText}>
                            Could not process the image. Hold steady and try again.
                        </Text>
                    )}
                    {(state === 'capturing' || state === 'recognizing') && (
                        <Text style={styles.hintText}>Please hold steady...</Text>
                    )}
                    {state === 'result' && (
                        <Text style={styles.resultText} accessibilityLiveRegion="polite">
                            {resultText}
                        </Text>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    {state === 'result' ? (
                        <>
                            <Pressable
                                accessibilityLabel="Read text aloud"
                                accessibilityRole="button"
                                onPress={handleReadAloud}
                                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                            >
                                <Text style={styles.primaryBtnText}>READ ALOUD</Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Scan again"
                                accessibilityRole="button"
                                onPress={handleScanAgain}
                                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                            >
                                <Text style={styles.secondaryBtnText}>SCAN AGAIN</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Pressable
                            accessibilityLabel="Scan text"
                            accessibilityRole="button"
                            onPress={handleScan}
                            disabled={isBusy}
                            style={({ pressed }) => [
                                styles.primaryBtn,
                                styles.fullBtn,
                                isBusy && styles.disabledBtn,
                                pressed && styles.pressed,
                            ]}
                        >
                            <Text style={styles.primaryBtnText}>
                                {isBusy ? 'PROCESSING...' : 'SCAN TEXT'}
                            </Text>
                        </Pressable>
                    )}
                </View>

            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { alignItems: 'center', flexDirection: 'row', height: 70, justifyContent: 'space-between', paddingHorizontal: 18 },
    headerButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 9, borderWidth: 1, height: 34, justifyContent: 'center', width: 55 },
    headerButtonText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
    headerRight: { width: 55 },
    pressed: { opacity: 0.72 },
    titleGroup: { alignItems: 'center' },
    title: { color: COLORS.text, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
    subtitle: { color: COLORS.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginTop: 4 },
    cameraFrame: { backgroundColor: '#000', flex: 1, overflow: 'hidden', position: 'relative' },
    overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    scanBox: { borderColor: 'rgba(116,226,208,0.4)', borderRadius: 12, borderWidth: 1, height: 180, position: 'relative', width: '85%', alignItems: 'center', justifyContent: 'center' },
    corner: { borderColor: COLORS.accent, height: 24, position: 'absolute', width: 24 },
    cornerTL: { borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 6, left: -1, top: -1 },
    cornerTR: { borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 6, right: -1, top: -1 },
    cornerBL: { borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6, bottom: -1, left: -1 },
    cornerBR: { borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6, bottom: -1, right: -1 },
    scanGuideText: { color: 'rgba(116,226,208,0.7)', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
    panel: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
    statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    panelEyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.7 },
    resultBox: { minHeight: 80, marginBottom: 16 },
    hintText: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22 },
    resultText: { color: COLORS.text, fontSize: 16, lineHeight: 26 },
    actions: { flexDirection: 'row', gap: 10 },
    primaryBtn: { alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 12, height: 48, justifyContent: 'center', paddingHorizontal: 20 },
    fullBtn: { flex: 1 },
    primaryBtnText: { color: COLORS.background, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
    secondaryBtn: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, height: 48, justifyContent: 'center', paddingHorizontal: 20 },
    secondaryBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    disabledBtn: { opacity: 0.5 },
});
