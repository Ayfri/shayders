import type { ChannelEntry } from '$features/shaders/model/shader-content';

interface ChannelTexState {
	lastVideoTime: number;
	stream: MediaStream | null;
	texture: WebGLTexture;
	url: string;
	videoEl: HTMLVideoElement | null;
}

interface ChannelUniformLocs {
	channels: (WebGLUniformLocation | null)[];
}

interface ChannelTextureManagerOptions {
	autoplayVideos?: boolean;
}

export class ChannelTextureManager {
	private readonly channelsById = new Map<number, ChannelTexState>();

	public constructor(
		private readonly getChannels: () => ChannelEntry[],
		private readonly getGl: () => WebGLRenderingContext | null,
		private readonly options: ChannelTextureManagerOptions = {},
	) {}

	public bind(
		locs: ChannelUniformLocs,
		getBufferTexture: (channel: ChannelEntry) => WebGLTexture | null,
		maxChannels: number,
	): void {
		const gl = this.getGl();
		if (!gl) return;

		for (const [id, state] of this.channelsById.entries()) {
			if (id >= maxChannels) continue;

			const loc = locs.channels[id];
			if (!loc) continue;

			const unit = 8 + id;
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.uniform1i(loc, unit);
		}

		for (const channel of this.getChannels()) {
			if (channel.type !== 'buffer' || !channel.bufferId || channel.id >= maxChannels) continue;

			const loc = locs.channels[channel.id];
			const texture = getBufferTexture(channel);
			const unit = 8 + channel.id;
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			if (loc && texture) gl.uniform1i(loc, unit);
		}
	}

	public destroy(): void {
		for (const id of Array.from(this.channelsById.keys())) {
			this.cleanup(id);
		}
	}

	public sync(): void {
		const gl = this.getGl();
		if (!gl) return;

		for (const channel of this.getChannels()) {
			if (channel.type === 'buffer') {
				this.cleanup(channel.id);
				continue;
			}

			const key = this.getStateKey(channel);
			const existing = this.channelsById.get(channel.id);
			if (existing && existing.url === key) continue;
			if (!key || !channel.type) {
				this.cleanup(channel.id);
				continue;
			}

			const filter = channel.filter ?? 'linear';
			const wrap = channel.wrap ?? 'clamp';
			const magFilter = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
			const minFilter = filter === 'nearest'
				? gl.NEAREST
				: filter === 'linear-mipmap'
					? gl.LINEAR_MIPMAP_LINEAR
					: gl.LINEAR;
			const wrapMode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;

			if (channel.type === 'webcam' && existing) {
				this.updateTextureParams(existing.texture, minFilter, magFilter, wrapMode);
				existing.url = key;
				continue;
			}

			this.cleanup(channel.id);
			const texture = gl.createTexture();
			if (!texture) continue;

			if (channel.type === 'image') {
				this.createImageTexture(channel, texture, minFilter, magFilter, wrapMode);
				continue;
			}

			if (channel.type === 'video') {
				this.createVideoTexture(channel, texture, minFilter, magFilter, wrapMode);
				continue;
			}

			this.createWebcamTexture(channel, texture, minFilter, magFilter, wrapMode);
		}

		for (const id of Array.from(this.channelsById.keys())) {
			const active = this.getChannels().find((channel) => channel.id === id);
			if (!active || active.type === 'buffer' || !this.getStateKey(active)) this.cleanup(id);
		}
	}

	public uploadVideoFrames(): void {
		const gl = this.getGl();
		if (!gl) return;

		for (const state of this.channelsById.values()) {
			if (!state.videoEl || state.videoEl.readyState < 2) continue;
			if (state.videoEl.currentTime === state.lastVideoTime) continue;
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.videoEl);
			gl.bindTexture(gl.TEXTURE_2D, null);
			state.lastVideoTime = state.videoEl.currentTime;
		}
	}

	public pauseVideos(): void {
		for (const state of this.channelsById.values()) {
			state.videoEl?.pause();
		}
	}

	public playVideos(): void {
		for (const state of this.channelsById.values()) {
			if (!state.videoEl) continue;
			void state.videoEl.play().catch(() => {});
		}
	}

	private cleanup(id: number): void {
		const gl = this.getGl();
		const existing = this.channelsById.get(id);
		if (!gl || !existing) return;

		gl.deleteTexture(existing.texture);
		if (existing.videoEl) {
			existing.videoEl.pause();
			existing.videoEl.src = '';
		}
		existing.stream?.getTracks().forEach((track) => track.stop());
		this.channelsById.delete(id);
	}

	private createImageTexture(
		channel: ChannelEntry,
		texture: WebGLTexture,
		minFilter: number,
		magFilter: number,
		wrapMode: number,
	): void {
		const gl = this.getGl();
		if (!gl || !channel.url) return;

		const image = new window.Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => {
			const currentGl = this.getGl();
			if (!currentGl) return;
			currentGl.bindTexture(currentGl.TEXTURE_2D, texture);
			currentGl.texImage2D(currentGl.TEXTURE_2D, 0, currentGl.RGBA, currentGl.RGBA, currentGl.UNSIGNED_BYTE, image);
			if (channel.filter === 'linear-mipmap') currentGl.generateMipmap(currentGl.TEXTURE_2D);
			this.updateTextureParams(texture, minFilter, magFilter, wrapMode);
		};
		image.onerror = () => console.error('Failed to load image:', channel.url);
		image.src = channel.url;
		this.initTexture(texture, minFilter, magFilter, wrapMode);
		this.channelsById.set(channel.id, {
			lastVideoTime: -1,
			stream: null,
			texture,
			url: this.getStateKey(channel),
			videoEl: null,
		});
	}

	private createVideoTexture(
		channel: ChannelEntry,
		texture: WebGLTexture,
		minFilter: number,
		magFilter: number,
		wrapMode: number,
	): void {
		if (!channel.url) return;

		const videoEl = document.createElement('video');
		videoEl.autoplay = true;
		videoEl.crossOrigin = 'anonymous';
		videoEl.loop = true;
		videoEl.muted = true;
		videoEl.playsInline = true;
		videoEl.preload = 'auto';
		videoEl.src = channel.url;
		if (this.options.autoplayVideos !== false) {
			videoEl.play().catch(() => {});
		}

		this.initTexture(texture, minFilter, magFilter, wrapMode);
		this.channelsById.set(channel.id, {
			lastVideoTime: -1,
			stream: null,
			texture,
			url: this.getStateKey(channel),
			videoEl,
		});
	}

	private createWebcamTexture(
		channel: ChannelEntry,
		texture: WebGLTexture,
		minFilter: number,
		magFilter: number,
		wrapMode: number,
	): void {
		const videoEl = document.createElement('video');
		videoEl.autoplay = true;
		videoEl.muted = true;
		videoEl.playsInline = true;

		const state: ChannelTexState = {
			lastVideoTime: -1,
			stream: null,
			texture,
			url: this.getStateKey(channel),
			videoEl,
		};
		this.channelsById.set(channel.id, state);
		navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } })
			.then((stream) => {
				state.stream = stream;
				videoEl.srcObject = stream;
				if (this.options.autoplayVideos !== false) {
					videoEl.play().catch(() => {});
				}
			})
			.catch((error) => console.error('Webcam error:', error));
		this.initTexture(texture, minFilter, magFilter, wrapMode);
	}

	private getStateKey(channel: ChannelEntry): string {
		const base = channel.type === 'webcam' ? 'webcam' : (channel.url ?? '');
		if (!base) return '';
		return `${base}|${channel.filter ?? 'linear'}|${channel.wrap ?? 'clamp'}|${channel.vflip ? '1' : '0'}`;
	}

	private initTexture(texture: WebGLTexture, minFilter: number, magFilter: number, wrapMode: number): void {
		const gl = this.getGl();
		if (!gl) return;

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
		this.updateTextureParams(texture, minFilter, magFilter, wrapMode);
	}

	private updateTextureParams(texture: WebGLTexture, minFilter: number, magFilter: number, wrapMode: number): void {
		const gl = this.getGl();
		if (!gl) return;

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
}
