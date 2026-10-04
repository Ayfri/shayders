const RECORDING_BITRATE = 48_000_000;
const RECORDING_FPS = 60;
const RECORDING_LIMIT_MS = 5 * 60 * 1000;
/** VP9 first for quality, MP4 for Safari which can't record WebM. The canvas stream has no audio track, so no audio codec is listed. */
const RECORDING_MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'] as const;

/**
 * Builds a download name from the shader name and the current time.
 * @example captureFileName('My Shader!', 'webp') === 'my-shader-2026-10-04T12-30-00.webp'
 */
export function captureFileName(shaderName: string, extension: string): string {
	const safeName = shaderName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'shader';
	return `${safeName}-${new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '')}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Records a canvas to a video file, stops by itself at the length limit. */
export class CanvasRecorder {
	public static readonly limitMs = RECORDING_LIMIT_MS;

	public elapsedMs = $state(0);
	#recorder = $state.raw<MediaRecorder | null>(null);
	#save = true;

	public get isRecording(): boolean {
		return this.#recorder !== null;
	}

	/** `undefined` during SSR and in browsers without a usable MediaRecorder format. */
	public static get mimeType(): string | undefined {
		return typeof MediaRecorder === 'undefined' ? undefined : RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
	}

	public start(canvas: HTMLCanvasElement, onSave: (blob: Blob, extension: string) => void): void {
		const mimeType = CanvasRecorder.mimeType;
		if (!mimeType || this.#recorder) return;

		const stream = canvas.captureStream(RECORDING_FPS);
		const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: RECORDING_BITRATE });
		const chunks: Blob[] = [];
		const startedAt = performance.now();
		const timer = window.setInterval(() => {
			this.elapsedMs = performance.now() - startedAt;
			if (this.elapsedMs >= RECORDING_LIMIT_MS) this.stop();
		}, 250);

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			window.clearInterval(timer);
			for (const track of stream.getTracks()) track.stop();
			this.#recorder = null;
			this.elapsedMs = 0;
			if (this.#save && chunks.length > 0) onSave(new Blob(chunks, { type: recorder.mimeType }), mimeType.startsWith('video/mp4') ? 'mp4' : 'webm');
		};

		this.#save = true;
		this.#recorder = recorder;
		recorder.start(1000);
	}

	/** @param save false drops the recording, used when the canvas unmounts mid-recording. */
	public stop(save = true): void {
		if (this.#recorder?.state !== 'recording') return;
		this.#save = save;
		this.#recorder.stop();
	}
}
