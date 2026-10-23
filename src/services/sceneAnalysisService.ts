declare const process: {
    env: {
        EXPO_PUBLIC_SCENE_ANALYSIS_HTTP_URL?: string;
        EXPO_PUBLIC_SCENE_ANALYSIS_WS_URL?: string;
        EXPO_PUBLIC_SCENE_ANALYSIS_UPLOAD_FIELD?: string;
    };
};

export type SceneBoundingBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SceneDetection = {
    className: string;
    confidence: number;
    box?: SceneBoundingBox;
};

export type SceneAnalysisResponse = {
    caption: string;
    detections: SceneDetection[];
    sequence?: number;
    timestamp?: number;
    processingTimeMs?: number;
};

export type SceneAnalysisConfig = {
    httpUrl: string;
    wsUrl: string;
    uploadField: string;
};

const config: SceneAnalysisConfig = {
    httpUrl: (process.env.EXPO_PUBLIC_SCENE_ANALYSIS_HTTP_URL ?? '').trim(),
    wsUrl: (process.env.EXPO_PUBLIC_SCENE_ANALYSIS_WS_URL ?? '').trim(),
    uploadField: (process.env.EXPO_PUBLIC_SCENE_ANALYSIS_UPLOAD_FIELD ?? 'frame').trim() || 'frame',
};

const REQUEST_TIMEOUT_MS = 60_000;

export function getSceneAnalysisConfig(): SceneAnalysisConfig {
    return config;
}

export function isSceneAnalysisConfigured() {
    return Boolean(config.wsUrl || config.httpUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseBox(value: unknown): SceneBoundingBox | undefined {
    if (Array.isArray(value) && value.length >= 4) {
        return {
            x: toNumber(value[0]),
            y: toNumber(value[1]),
            width: toNumber(value[2]),
            height: toNumber(value[3]),
        };
    }

    if (!isRecord(value)) return undefined;

    return {
        x: toNumber(value.x ?? value.left),
        y: toNumber(value.y ?? value.top),
        width: toNumber(value.width ?? value.w),
        height: toNumber(value.height ?? value.h),
    };
}

function normalizeDetection(value: unknown): SceneDetection | null {
    if (!isRecord(value)) return null;

    const className = value.className ?? value.class ?? value.label ?? value.name;
    if (typeof className !== 'string' || !className.trim()) return null;

    return {
        className: className.trim(),
        confidence: toNumber(value.confidence ?? value.score),
        box: parseBox(value.box ?? value.bbox ?? value.boundingBox ?? value.bounding_box),
    };
}

function normalizeResponse(payload: unknown): SceneAnalysisResponse {
    if (!isRecord(payload)) {
        throw new Error('Scene-analysis backend returned an invalid response.');
    }

    const source = isRecord(payload.result) ? payload.result : payload;
    const captionValue = source.caption ?? source.description ?? source.scene_description ?? source.text;
    if (typeof captionValue !== 'string' || !captionValue.trim()) {
        throw new Error('Scene-analysis backend returned no caption.');
    }

    const detections = Array.isArray(source.detections)
        ? source.detections.map(normalizeDetection).filter((item): item is SceneDetection => item !== null)
        : [];

    return {
        caption: captionValue.trim(),
        detections,
        sequence: typeof source.sequence === 'number' ? source.sequence : undefined,
        timestamp: typeof source.timestamp === 'number' ? source.timestamp : undefined,
        processingTimeMs: typeof source.processingTimeMs === 'number'
            ? source.processingTimeMs
            : typeof source.processing_time_ms === 'number'
                ? source.processing_time_ms
                : undefined,
    };
}

function withTimeout(signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) controller.abort();
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timeout),
    };
}

export async function analyzeSceneFrame(imageUri: string, signal?: AbortSignal): Promise<SceneAnalysisResponse> {
    if (!config.httpUrl) {
        throw new Error('Scene-analysis HTTP URL is not configured.');
    }

    const timeout = withTimeout(signal);

    try {
        const body = new FormData();
        const fileName = `scene-${Date.now()}.jpg`;
        const imageResponse = await fetch(imageUri);
        const imageBlob = await imageResponse.blob();

        if (imageBlob.size === 0) {
            throw new Error('Could not read the camera frame.');
        }

        body.append(config.uploadField, imageBlob, fileName);

        const response = await fetch(config.httpUrl, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body,
            signal: timeout.signal,
        });

        if (!response.ok) {
            throw new Error(`Scene-analysis backend returned HTTP ${response.status}.`);
        }

        return normalizeResponse(await response.json());
    } finally {
        timeout.cleanup();
    }
}

type PendingRequest = {
    resolve: (response: SceneAnalysisResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export class LiveSceneAnalysisSocket {
    private socket: WebSocket | null = null;
    private connecting: Promise<void> | null = null;
    private sequence = 0;
    private pending = new Map<number, PendingRequest>();

    constructor(private readonly url: string) {}

    connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.connecting) return this.connecting;

        this.connecting = new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(this.url);
            this.socket = socket;

            socket.onopen = () => {
                this.connecting = null;
                resolve();
            };

            socket.onerror = () => {
                const error = new Error('Could not connect to the scene-analysis WebSocket.');
                this.connecting = null;
                this.rejectPending(error);
                reject(error);
            };

            socket.onclose = () => {
                this.socket = null;
                this.connecting = null;
                this.rejectPending(new Error('Scene-analysis WebSocket closed.'));
            };

            socket.onmessage = (event) => {
                if (typeof event.data !== 'string') return;

                try {
                    const payload = JSON.parse(event.data) as unknown;
                    const sequence = isRecord(payload) && typeof payload.sequence === 'number'
                        ? payload.sequence
                        : this.pending.keys().next().value;

                    if (typeof sequence !== 'number') return;
                    const request = this.pending.get(sequence);
                    if (!request) return;

                    clearTimeout(request.timeout);
                    this.pending.delete(sequence);
                    request.resolve(normalizeResponse(payload));
                } catch (error) {
                    const firstSequence = this.pending.keys().next().value;
                    if (typeof firstSequence !== 'number') return;
                    const request = this.pending.get(firstSequence);
                    if (!request) return;
                    clearTimeout(request.timeout);
                    this.pending.delete(firstSequence);
                    request.reject(error instanceof Error ? error : new Error('Invalid scene-analysis response.'));
                }
            };
        });

        return this.connecting;
    }

    async sendFrame(imageUri: string): Promise<SceneAnalysisResponse> {
        await this.connect();

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Scene-analysis WebSocket is not open.');
        }

        const sequence = ++this.sequence;
        const imageResponse = await fetch(imageUri);
        const imageBlob = await imageResponse.blob();

        return new Promise<SceneAnalysisResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(sequence);
                reject(new Error('Scene-analysis WebSocket request timed out.'));
            }, REQUEST_TIMEOUT_MS);

            this.pending.set(sequence, { resolve, reject, timeout });
            this.socket?.send(JSON.stringify({
                type: 'frame',
                sequence,
                timestamp: Date.now(),
                contentType: 'image/jpeg',
            }));
            this.socket?.send(imageBlob);
        });
    }

    close() {
        this.rejectPending(new Error('Scene-analysis WebSocket stopped.'));
        this.socket?.close();
        this.socket = null;
        this.connecting = null;
    }

    private rejectPending(error: Error) {
        for (const [sequence, request] of this.pending) {
            clearTimeout(request.timeout);
            request.reject(error);
            this.pending.delete(sequence);
        }
    }
}
