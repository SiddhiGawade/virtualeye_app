import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
    bg: '#060E1A',
    surface: '#0C1929',
    surfaceHigh: '#112236',
    text: '#F0F6FF',
    textSub: '#8BA0B8',
    textDim: '#4F6478',
    accent: '#5EEAD4',
    accentDim: '#0D3330',
    border: '#1A2E42',
    white: '#FFFFFF',
};

type FeatureCard = {
    route: '/camera' | '/text-reader' | '/settings';
    label: string;
    title: string;
    desc: string;
    accent: boolean;
    tag: string;
};

const CARDS: FeatureCard[] = [
    {
        route: '/camera',
        label: 'Start camera',
        title: 'Scene Camera',
        desc: 'Live scene captioning with YOLO detection and BLIP descriptions',
        accent: true,
        tag: 'LIVE',
    },
    {
        route: '/text-reader',
        label: 'Open text reader',
        title: 'Text Reader',
        desc: 'Point at any text and have it read aloud instantly',
        accent: false,
        tag: 'OCR',
    },
    {
        route: '/settings',
        label: 'Open settings',
        title: 'Settings',
        desc: 'Permissions, speech preferences and app info',
        accent: false,
        tag: 'CONFIG',
    },
];

export default function HomeScreen() {
    const router = useRouter();
    const [voiceEnabled, setVoiceEnabled] = useState(false);

    useFocusEffect(
        useCallback(() => {
            setVoiceEnabled(true);
            return () => setVoiceEnabled(false);
        }, [])
    );

    const { voiceState } = useVoiceCommands(voiceEnabled, (intent) => {
        switch (intent) {
            case 'START_CAMERA': router.push('/camera'); break;
            case 'OPEN_TEXT_READER': router.push('/text-reader'); break;
            case 'GO_HOME':
            case 'STOP_SPEECH': void Speech.stop(); break;
            default: break;
        }
    });

    const isAwake = voiceState === 'awake';

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <View style={s.logo}>
                        <View style={s.logoInner} />
                    </View>
                    <Text style={s.logoText}>VIRTUAL EYE</Text>
                    <View style={s.headerRight}>
                        <View style={[s.micDot, voiceState === 'listening' && s.micDotActive, isAwake && s.micDotAwake]} />
                    </View>
                </View>

                {/* Hero */}
                <View style={s.hero}>
                    <Text style={s.heroLabel}>ASSISTIVE VISION</Text>
                    <Text style={s.heroTitle}>See what's{'\n'}<Text style={s.heroAccent}>in front of you.</Text></Text>
                    <Text style={s.heroSub}>
                        Virtual Eye analyzes live camera frames and describes your surroundings in real time.
                    </Text>
                </View>

                {/* Cards */}
                <View style={s.cards}>
                    {CARDS.map((card) => (
                        <Pressable
                            key={card.route}
                            accessibilityRole="button"
                            accessibilityLabel={card.label}
                            onPress={() => router.push(card.route)}
                            style={({ pressed }) => [
                                s.card,
                                card.accent && s.cardAccent,
                                pressed && s.pressed,
                            ]}
                        >
                            <View style={s.cardTop}>
                                <View style={[s.cardTag, card.accent && s.cardTagAccent]}>
                                    <Text style={[s.cardTagText, card.accent && s.cardTagTextAccent]}>{card.tag}</Text>
                                </View>
                                <Text style={[s.cardArrow, card.accent && s.cardArrowAccent]}>→</Text>
                            </View>
                            <Text style={[s.cardTitle, card.accent && s.cardTitleAccent]}>{card.title}</Text>
                            <Text style={[s.cardDesc, card.accent && s.cardDescAccent]}>{card.desc}</Text>
                        </Pressable>
                    ))}
                </View>

                {/* Voice bar */}
                <View style={[s.voiceBar, isAwake && s.voiceBarAwake]}>
                    <View style={[s.voicePulse, isAwake && s.voicePulseAwake]} />
                    <Text style={[s.voiceText, isAwake && s.voiceTextAwake]}>
                        {voiceState === 'idle' && 'Voice off'}
                        {voiceState === 'listening' && 'Say "Hey Vision" to start'}
                        {voiceState === 'awake' && 'Listening — say a command'}
                        {voiceState === 'processing' && 'Processing command...'}
                        {voiceState === 'permission_denied' && 'Microphone permission denied'}
                        {voiceState === 'error' && 'Voice recognition unavailable'}
                    </Text>
                </View>

                <Text style={s.privacy}>Scene frames are sent only to the configured analysis backend for captioning.</Text>

            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 36 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: {
        width: 28, height: 28, borderRadius: 8, borderWidth: 2,
        borderColor: C.accent, alignItems: 'center', justifyContent: 'center',
        transform: [{ rotate: '45deg' }],
    },
    logoInner: { width: 9, height: 9, borderRadius: 3, backgroundColor: C.accent, transform: [{ rotate: '-45deg' }] },
    logoText: { color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 2.5, flex: 1 },
    headerRight: { alignItems: 'center', justifyContent: 'center', width: 28 },
    micDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
    micDotActive: { backgroundColor: C.textDim },
    micDotAwake: { backgroundColor: C.accent },

    hero: { marginTop: 40, marginBottom: 8 },
    heroLabel: { color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
    heroTitle: { color: C.text, fontSize: 38, fontWeight: '800', letterSpacing: -1, lineHeight: 42 },
    heroAccent: { color: C.accent },
    heroSub: { color: C.textSub, fontSize: 14, lineHeight: 22, marginTop: 14, maxWidth: 340 },

    cards: { marginTop: 28, gap: 12 },
    card: {
        backgroundColor: C.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        padding: 20,
    },
    cardAccent: {
        backgroundColor: C.accent,
        borderColor: C.accent,
    },
    pressed: { opacity: 0.75 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    cardTag: {
        backgroundColor: C.surfaceHigh,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    cardTagAccent: { backgroundColor: 'rgba(0,0,0,0.18)' },
    cardTagText: { color: C.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
    cardTagTextAccent: { color: 'rgba(6,14,26,0.7)' },
    cardArrow: { color: C.textDim, fontSize: 18 },
    cardArrowAccent: { color: 'rgba(6,14,26,0.6)' },
    cardTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
    cardTitleAccent: { color: C.bg },
    cardDesc: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    cardDescAccent: { color: 'rgba(6,14,26,0.65)' },

    voiceBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: C.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginTop: 20,
    },
    voiceBarAwake: { borderColor: C.accent, backgroundColor: C.accentDim },
    voicePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.textDim },
    voicePulseAwake: { backgroundColor: C.accent },
    voiceText: { color: C.textSub, fontSize: 12, fontWeight: '600', flex: 1 },
    voiceTextAwake: { color: C.accent },

    privacy: { color: C.textDim, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 17 },
});
