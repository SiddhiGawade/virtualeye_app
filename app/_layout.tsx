import { Stack } from 'expo-router';

export default function RootLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#07111F' },
                animation: 'slide_from_right',
            }}
        />
    );
}