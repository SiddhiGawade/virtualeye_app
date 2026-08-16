import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    warning: '#F4C97B',
    warningDim: '#2A1F0A',
    ok: '#5EEAD4',
};

type RowProps = {
    label: string;
    value?: string;
    valueColor?: string;
    onPress?: () => void;
    last?: boolean;
};

function Row({ label, value, valueColor, onPress, last }: RowProps) {
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [
                s.row,
                !last && s.rowBorder,
                pressed && onPress && s.pressed,
            ]}
        >
            <Text style={s.rowLabel}>{label}</Text>
            {value && (
                <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>
                    {value}
                </Text>
            )}
            {onPress && <Text style={s.rowChevron}>›</Text>}
        </Pressable>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={s.section}>
            <Text style={s.sectionTitle}>{title}</Text>
            <View style={s.sectionCard}>{children}</View>
        </View>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const [permission] = useCameraPermissions();

    const cameraStatus = permission?.granted ? 'Granted' : permission?.canAskAgain ? 'Not granted' : 'Blocked';
    const cameraColor = permission?.granted ? C.ok : C.warning;
    const openSettings = () => void Linking.openSettings();

    return (
        <SafeAreaView style={s.safe}>
            {/* Header */}
            <View style={s.header}>
                <Pressable
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                    onPress={() => router.back()}
                    style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
                >
                    <Text style={s.backBtnText}>← BACK</Text>
                </Pressable>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>SETTINGS</Text>
                    <Text style={s.headerSub}>PREFERENCES & INFO</Text>
                </View>
                <View style={s.headerRight} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Permission alert */}
                {!permission?.granted && (
                    <Pressable
                        onPress={openSettings}
                        accessibilityRole="button"
                        style={({ pressed }) => [s.alert, pressed && s.pressed]}
                    >
                        <View style={s.alertDot} />
                        <Text style={s.alertText}>
                            Camera permission {permission?.canAskAgain ? 'not granted' : 'blocked'} — tap to open Settings
                        </Text>
                        <Text style={s.alertChevron}>›</Text>
                    </Pressable>
                )}

                <Section title="PERMISSIONS">
                    <Row label="Camera" value={cameraStatus} valueColor={cameraColor} onPress={!permission?.granted ? openSettings : undefined} />
                    <Row label="Microphone" value="For voice commands" last />
                </Section>

                <Section title="SPEECH">
                    <Row label="Engine" value="On-device TTS" />
                    <Row label="Auto-read" value="Toggle per session" />
                    <Row label="Speech rate" value="0.92×" last />
                </Section>

                <Section title="VOICE COMMANDS">
                    <Row label="Wake phrase" value='"Hey Vision"' />
                    <Row label="Listening mode" value="Foreground only" />
                    <Row label="Session timeout" value="15 seconds" last />
                </Section>

                <Section title="SCENE CAMERA">
                    <Row label="Frame interval" value="3.2 seconds" />
                    <Row label="ML model" value="On-device ML Kit" />
                    <Row label="Network required" value="No" last />
                </Section>

                <Section title="ABOUT">
                    <Row label="App" value="Virtual Eye" />
                    <Row label="Version" value="1.0.0" />
                    <Row label="Privacy" value="On-device only" last />
                </Section>

                <Text style={s.footer}>
                    All camera frames, voice transcripts, and scene descriptions are processed on your device and never uploaded.
                </Text>

            </ScrollView>
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

    scroll: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },

    alert: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: C.warningDim, borderRadius: 14, borderWidth: 1,
        borderColor: C.warning, padding: 14, marginBottom: 8,
    },
    alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.warning },
    alertText: { color: C.warning, fontSize: 13, lineHeight: 19, flex: 1 },
    alertChevron: { color: C.warning, fontSize: 20, marginTop: -2 },

    section: { marginTop: 28 },
    sectionTitle: { color: C.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 10, paddingLeft: 4 },
    sectionCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    rowLabel: { color: C.text, fontSize: 14, flex: 1 },
    rowValue: { color: C.textSub, fontSize: 13 },
    rowChevron: { color: C.textDim, fontSize: 20, marginLeft: 6, marginTop: -2 },

    footer: { color: C.textDim, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 32, paddingHorizontal: 12 },
});
