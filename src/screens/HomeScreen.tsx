import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function HomeScreen() {
    const router = useRouter();
    const [voiceEnabled, setVoiceEnabled] = useState(false);

    // Only enable voice when this screen is focused
    useFocusEffect(
        useCallback(() => {
            setVoiceEnabled(true);
            return () => setVoiceEnabled(false);
        }, [])
    );

    const { voiceState } = useVoiceCommands(voiceEnabled, (intent) => {
        switch (intent) {
            case 'START_CAMERA':
                router.push('/camera');
                break;
            case 'OPEN_TEXT_READER':
                router.push('/text-reader');
                break;
            case 'GO_HOME':
            case 'STOP_SPEECH':
                void Speech.stop();
                break;
            default:
                break;
        }
    });

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.brandMark}>
                        <View style={styles.brandMarkInner} />
                    </View>
                    <Text style={styles.brandName}>VIRTUAL EYE</Text>
                </View>

                {/* Hero */}
                <View style={styles.hero}>
                    <View style={styles.eyebrowRow}>
                        <View style={styles.eyebrowLine} />
                        <Text style={styles.eyebrow}>PERSONAL ASSISTIVE VISION</Text>
                    </View>
                    <Text style={styles.heroTitle}>
                        See what is{'\n'}
                        <Text style={styles.heroAccent}>in front of you.</Text>
                    </Text>
                    <Text style={styles.heroDescription}>
                        Virtual Eye watches the live camera, understands the scene, and speaks
                        the latest description so you can move through the world with more confidence.
                    </Text>
                </View>

                {/* Feature Cards */}
                <View style={styles.cards}>

                    {/* Start Camera */}
                    <Pressable
                        style={({ pressed }) => [styles.primaryCard, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Start camera"
                        onPress={() => router.push('/camera')}
                    >
                        <View style={styles.cardIcon}>
                            <View style={styles.dot} />
                        </View>
                        <View style={styles.cardBody}>
                            <Text style={styles.cardTitle}>Scene Camera</Text>
                            <Text style={styles.cardDesc}>Live scene captioning with on-device ML</Text>
                        </View>
                        <Text style={styles.cardArrow}>→</Text>
                    </Pressable>

                    {/* Text Reader */}
                    <Pressable
                        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Open text reader"
                        onPress={() => router.push('/text-reader')}
                    >
                        <View style={styles.cardIcon}>
                            <View style={[styles.dot, styles.dotMuted]} />
                        </View>
                        <View style={styles.cardBody}>
                            <Text style={styles.cardTitle}>Text Reader</Text>
                            <Text style={styles.cardDesc}>Capture and read visible text aloud</Text>
                        </View>
                        <Text style={styles.cardArrow}>→</Text>
                    </Pressable>

                    {/* Settings */}
                    <Pressable
                        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Open settings"
                        onPress={() => router.push('/settings')}
                    >
                        <View style={styles.cardIcon}>
                            <View style={[styles.dot, styles.dotMuted]} />
                        </View>
                        <View style={styles.cardBody}>
                            <Text style={styles.cardTitle}>Settings</Text>
                            <Text style={styles.cardDesc}>Permissions, speech and display preferences</Text>
                        </View>
                        <Text style={styles.cardArrow}>→</Text>
                    </Pressable>

                </View>

                {/* Footer note */}
                <Text style={styles.footerNote}>Camera access is used only while you are scanning.</Text>

                {/* Voice status indicator */}
                <View style={styles.voiceStatus}>
                    <View style={[
                        styles.voiceDot,
                        voiceState === 'awake' && styles.voiceDotAwake,
                        voiceState === 'listening' && styles.voiceDotListening,
                    ]} />
                    <Text style={styles.voiceStatusText}>
                        {voiceState === 'listening' && 'SAY "HEY VISION" TO WAKE'}
                        {voiceState === 'awake' && 'LISTENING — SAY A COMMAND'}
                        {voiceState === 'processing' && 'PROCESSING...'}
                        {voiceState === 'permission_denied' && 'MICROPHONE PERMISSION DENIED'}
                        {voiceState === 'error' && 'VOICE UNAVAILABLE'}
                        {voiceState === 'idle' && 'VOICE OFF'}
                    </Text>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    container: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 32 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandMark: {
        width: 27, height: 27, borderRadius: 8, borderWidth: 2,
        borderColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
        transform: [{ rotate: '45deg' }],
    },
    brandMarkInner: {
        width: 9, height: 9, borderRadius: 4, backgroundColor: COLORS.accent,
        transform: [{ rotate: '-45deg' }],
    },
    brandName: { color: COLORS.text, fontSize: 14, fontWeight: '700', letterSpacing: 2.4 },
    hero: { marginTop: 36 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
    eyebrowLine: { width: 28, height: 2, backgroundColor: COLORS.accent },
    eyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
    heroTitle: { color: COLORS.text, fontSize: 40, fontWeight: '700', letterSpacing: -1.5, lineHeight: 44 },
    heroAccent: { color: COLORS.accent },
    heroDescription: { color: COLORS.textMuted, fontSize: 15, lineHeight: 23, marginTop: 16 },
    cards: { marginTop: 32, gap: 12 },
    primaryCard: {
        backgroundColor: COLORS.accent, borderRadius: 16,
        flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14,
    },
    card: {
        backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1,
        borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center',
        padding: 18, gap: 14,
    },
    pressed: { opacity: 0.72 },
    cardIcon: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.background },
    dotMuted: { backgroundColor: COLORS.accent },
    cardBody: { flex: 1 },
    cardTitle: { color: COLORS.background, fontSize: 15, fontWeight: '700' },
    cardDesc: { color: 'rgba(7,17,31,0.65)', fontSize: 12, marginTop: 3 },
    cardArrow: { color: COLORS.background, fontSize: 20 },
    footerNote: {
        color: COLORS.textDim, fontSize: 11, textAlign: 'center', marginTop: 28,
    },
    cardTitleDark: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
    cardDescDark: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
    voiceStatus: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
        marginTop: 16,
        paddingVertical: 10,
    },
    voiceDot: {
        backgroundColor: COLORS.border,
        borderRadius: 5,
        height: 8,
        width: 8,
    },
    voiceDotListening: {
        backgroundColor: COLORS.textDim,
    },
    voiceDotAwake: {
        backgroundColor: COLORS.accent,
    },
    voiceStatusText: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.2,
    },

});
