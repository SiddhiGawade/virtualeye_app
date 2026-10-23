import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import {
    HELP_TEXT,
    WAKE_PHRASE,
    parseVoiceCommand,
    type VoiceIntent,
} from '../services/voiceCommandService';

declare const require: (moduleName: string) => unknown;

type SpeechRecognitionEvent = {
    results?: Array<{ transcript?: string }>;
    isFinal?: boolean;
    error?: string;
};

type SpeechRecognitionApi = {
    ExpoSpeechRecognitionModule: {
        requestPermissionsAsync: () => Promise<{ granted: boolean }>;
        start: (options: {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
        }) => void;
        stop: () => void;
    };
    useSpeechRecognitionEvent: (
        eventName: 'result' | 'end' | 'error',
        listener: (event: SpeechRecognitionEvent) => void,
    ) => void;
};

function loadSpeechRecognitionApi(): SpeechRecognitionApi | null {
    try {
        const module = require('expo-speech-recognition') as Partial<SpeechRecognitionApi>;
        if (!module.ExpoSpeechRecognitionModule || !module.useSpeechRecognitionEvent) return null;
        return module as SpeechRecognitionApi;
    } catch {
        return null;
    }
}

const speechRecognitionApi = loadSpeechRecognitionApi();
const useOptionalSpeechRecognitionEvent = speechRecognitionApi?.useSpeechRecognitionEvent ?? (() => undefined);

export type VoiceState =
    | 'idle'
    | 'listening'
    | 'awake'
    | 'processing'
    | 'permission_denied'
    | 'error';

export type UseVoiceCommandsResult = {
    voiceState: VoiceState;
    lastIntent: VoiceIntent | null;
    clearIntent: () => void;
    startListening: () => void;
    stopListening: () => void;
};

const AWAKE_TIMEOUT_MS = 15000;

export function useVoiceCommands(
    enabled: boolean,
    onIntent?: (intent: VoiceIntent) => void,
): UseVoiceCommandsResult {
    const [voiceState, setVoiceState] = useState<VoiceState>('idle');
    const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);

    const onIntentRef = useRef(onIntent);
    const awakeRef = useRef(false);
    const enabledRef = useRef(enabled);
    const sessionActiveRef = useRef(false);
    const awakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { onIntentRef.current = onIntent; }, [onIntent]);
    useEffect(() => { enabledRef.current = enabled; }, [enabled]);

    const clearAwakeTimeout = useCallback(() => {
        if (awakeTimeoutRef.current) {
            clearTimeout(awakeTimeoutRef.current);
            awakeTimeoutRef.current = null;
        }
    }, []);

    const resetAwakeTimeout = useCallback(() => {
        clearAwakeTimeout();
        awakeTimeoutRef.current = setTimeout(() => {
            awakeRef.current = false;
            setVoiceState('listening');
        }, AWAKE_TIMEOUT_MS);
    }, [clearAwakeTimeout]);

    const doStart = useCallback(async () => {
        if (sessionActiveRef.current || !enabledRef.current) return;
        if (!speechRecognitionApi) {
            setVoiceState('error');
            return;
        }

        const permission = await speechRecognitionApi.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) {
            setVoiceState('permission_denied');
            return;
        }
        try {
            speechRecognitionApi.ExpoSpeechRecognitionModule.start({
                lang: 'en-US',
                interimResults: false,
                continuous: false,
            });
            sessionActiveRef.current = true;
            setVoiceState(awakeRef.current ? 'awake' : 'listening');
        } catch {
            sessionActiveRef.current = false;
        }
    }, []);

    const scheduleRestart = useCallback(() => {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
            if (enabledRef.current) void doStart();
        }, 150);
    }, [doStart]);

    const startListening = useCallback(() => {
        void doStart();
    }, [doStart]);

    const stopListening = useCallback(() => {
        clearAwakeTimeout();
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        awakeRef.current = false;
        sessionActiveRef.current = false;
        try { speechRecognitionApi?.ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
        setVoiceState('idle');
    }, [clearAwakeTimeout]);

    useEffect(() => {
        if (enabled) void doStart();
        else stopListening();
        return () => {
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            stopListening();
        };
    }, [enabled, doStart, stopListening]);

    function handleIntent(intent: VoiceIntent) {
        if (intent === 'UNKNOWN') {
            if (awakeRef.current) resetAwakeTimeout();
            return;
        }
        if (intent === 'HELP') {
            void Speech.stop();
            Speech.speak(HELP_TEXT, { rate: 0.92 });
            resetAwakeTimeout();
        } else if (intent === 'STOP_SPEECH') {
            void Speech.stop();
            resetAwakeTimeout();
        } else if (intent === 'GO_HOME' || intent === 'STOP_CAMERA') {
            clearAwakeTimeout();
            awakeRef.current = false;
            setVoiceState('listening');
            onIntentRef.current?.(intent);
            setLastIntent(intent);
            return;
        } else {
            resetAwakeTimeout();
        }
        onIntentRef.current?.(intent);
        setLastIntent(intent);
    }

    useOptionalSpeechRecognitionEvent('result', (event) => {
        if (!enabledRef.current) return;
        const transcript = event.results?.[0]?.transcript?.trim() ?? '';
        if (!transcript) return;
        const lower = transcript.toLowerCase();

        if (!awakeRef.current) {
            if (lower.includes(WAKE_PHRASE)) {
                awakeRef.current = true;
                setVoiceState('awake');
                void Speech.stop();
                Speech.speak("I'm listening.", { rate: 0.95 });
                resetAwakeTimeout();

                const afterWake = lower.split(WAKE_PHRASE)[1]?.trim();
                if (afterWake && afterWake.length > 2) {
                    const intent = parseVoiceCommand(afterWake);
                    if (intent !== 'UNKNOWN') {
                        clearAwakeTimeout();
                        handleIntent(intent);
                    }
                }
            }
            return;
        }

        if (!event.isFinal) return;
        clearAwakeTimeout();
        setVoiceState('processing');
        handleIntent(parseVoiceCommand(transcript));
    });

    useOptionalSpeechRecognitionEvent('end', () => {
        sessionActiveRef.current = false;
        if (enabledRef.current) scheduleRestart();
    });

    useOptionalSpeechRecognitionEvent('error', (event) => {
        sessionActiveRef.current = false;
        if (!enabledRef.current) return;
        const retriable = ['no-speech', 'aborted', 'audio-capture'];
        if (retriable.includes(event.error ?? '')) {
            scheduleRestart();
            return;
        }
        setVoiceState('error');
    });

    const clearIntent = useCallback(() => setLastIntent(null), []);

    return { voiceState, lastIntent, clearIntent, startListening, stopListening };
}
