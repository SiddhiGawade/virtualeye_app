export type VoiceIntent =
    | 'WAKE'
    | 'START_CAMERA'
    | 'OPEN_TEXT_READER'
    | 'GO_HOME'
    | 'STOP_CAMERA'
    | 'SPEAK_AGAIN'
    | 'AUTO_READ_ON'
    | 'AUTO_READ_OFF'
    | 'STOP_SPEECH'
    | 'HELP'
    | 'UNKNOWN';

export const WAKE_PHRASE = 'hey vision';

function normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

const INTENT_MAP: Array<{ patterns: string[]; intent: VoiceIntent }> = [
    {
        patterns: ['hey vision'],
        intent: 'WAKE',
    },
    {
        patterns: ['start camera', 'open camera', 'launch camera'],
        intent: 'START_CAMERA',
    },
    {
        patterns: ['open text reader', 'read text', 'text reader', 'scan text'],
        intent: 'OPEN_TEXT_READER',
    },
    {
        patterns: ['go home', 'home', 'go back home'],
        intent: 'GO_HOME',
    },
    {
        patterns: ['stop camera', 'close camera'],
        intent: 'STOP_CAMERA',
    },
    {
        patterns: ['what do you see', 'speak again', 'repeat', 'say again', 'repeat that', 'describe', 'what is this', 'tell me', 'speak'],
        intent: 'SPEAK_AGAIN',
    },
    {
        patterns: ['turn auto read on', 'auto read on', 'enable auto read'],
        intent: 'AUTO_READ_ON',
    },
    {
        patterns: ['turn auto read off', 'auto read off', 'disable auto read'],
        intent: 'AUTO_READ_OFF',
    },
    {
        patterns: ['stop speaking', 'stop speech', 'be quiet', 'silence'],
        intent: 'STOP_SPEECH',
    },
    {
        patterns: ['help', 'what can you do', 'commands', 'show commands'],
        intent: 'HELP',
    },
];

export function parseVoiceCommand(transcript: string): VoiceIntent {
    const normalized = normalize(transcript);

    for (const { patterns, intent } of INTENT_MAP) {
        if (patterns.some(p => normalized.includes(p))) {
            return intent;
        }
    }

    return 'UNKNOWN';
}

export const HELP_TEXT =
    'You can say: start camera, open text reader, go home, stop camera, speak again, ' +
    'turn auto read on, turn auto read off, stop speaking, or help.';
