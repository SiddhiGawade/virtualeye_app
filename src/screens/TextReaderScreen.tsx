import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function TextReaderScreen() {
    const router = useRouter();
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Text Reader</Text>
            <Text style={styles.sub}>Coming soon</Text>
            <Pressable onPress={() => router.back()} style={styles.back}>
                <Text style={styles.backText}>← Go Back</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#07111F', alignItems: 'center', justifyContent: 'center' },
    title: { color: '#F6FAFF', fontSize: 24, fontWeight: '700' },
    sub: { color: '#9CAEC4', marginTop: 8 },
    back: { marginTop: 32 },
    backText: { color: '#74E2D0', fontSize: 14 },
});
