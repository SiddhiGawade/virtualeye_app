import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';

const COLORS = {
    background: '#07111F',
    surface: '#0D1C2F',
    surfaceRaised: '#132640',
    text: '#F6FAFF',
    textMuted: '#9CAEC4',
    textDim: '#6E829B',
    accent: '#74E2D0',
    accentDark: '#163E3A',
    border: '#213752',
    warning: '#F4C97B',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.sectionBody}>{children}</View>
        </View>
    );
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}
        >
            <Text style={styles.rowLabel}>{label}</Text>
            {value ? <Text style={[styles.rowValue, onPress && styles.rowValueLink]}>{value}</Text> : null}
        </Pressable>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const [permission] = useCameraPermissions();

    const cameraStatus = permission?.granted
        ? 'Granted'
        : permission?.canAskAgain
            ? 'Not granted'
            : 'Blocked';

    const openSettings = () => void Linking.openSettings();

    return (
        <SafeAreaView style={styles.safe}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                >
                    <Text style={styles.headerButtonText}>BACK</Text>
                </Pressable>
                <View style={styles.titleGroup}>
                    <Text style={styles.title}>SETTINGS</Text>
                    <Text style={styles.subtitle}>PREFERENCES & INFO</Text>
                </View>
                <View style={styles.headerRight} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                <Section title="PERMISSIONS">
                    <Row
                        label="Camera"
                        value={cameraStatus}
                        onPress={!permission?.granted ? openSettings : undefined}
                    />
                    <Row
                        label="Microphone"
                        value="Not required"
                    />
                </Section>

                <Section title="SPEECH">
                    <Row label="Engine" value="On-device TTS" />
                    <Row label="Auto-read" value="Toggle per session" />
                    <Row label="Speech rate" value="0.92×" />
                </Section>

                <Section title="SCENE CAMERA">
                    <Row label="Frame interval" value="3.2 seconds" />
                    <Row label="Model" value="On-device ML Kit" />
                    <Row label="Network required" value="No" />
                </Section>

                <Section title="ABOUT">
                    <Row label="App" value="Virtual Eye" />
                    <Row label="Version" value="1.0.0" />
                    <Row label="Privacy" value="All processing is on-device" />
                </Section>

                {!permission?.granted && (
                    <Pressable
                        onPress={openSettings}
                        style={({ pressed }) => [styles.openSettingsBtn, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Open system settings"
                    >
                        <Text style={styles.openSettingsBtnText}>OPEN SYSTEM SETTINGS</Text>
                    </Pressable>
                )}

            </ScrollView>
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
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    section: { marginTop: 28 },
    sectionTitle: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, marginBottom: 10 },
    sectionBody: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    row: { alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
    rowLabel: { color: COLORS.text, fontSize: 14 },
    rowValue: { color: COLORS.textMuted, fontSize: 13 },
    rowValueLink: { color: COLORS.accent },
    openSettingsBtn: { alignItems: 'center', backgroundColor: COLORS.accentDark, borderColor: COLORS.accent, borderRadius: 12, borderWidth: 1, height: 48, justifyContent: 'center', marginTop: 28 },
    openSettingsBtnText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
});
