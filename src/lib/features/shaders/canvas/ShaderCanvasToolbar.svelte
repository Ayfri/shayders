<script lang="ts">
	import { Camera, Circle, GitFork, Info, Square } from '@lucide/svelte';
	import { auth } from '#features/auth/auth-client.svelte.js';
	import { CanvasRecorder } from '#features/shaders/canvas/canvas-capture.svelte.js';
	import { shaderState } from '#features/shaders/model/shader-state.svelte.js';
	import { getUserProfilePath } from '#lib/site.js';

	interface Props {
		authorId?: string;
		authorName?: string;
		buildTime: number;
		canRecordVideo?: boolean;
		captureScreenshot: () => void;
		isSavingLocally?: boolean;
		onFork?: () => void;
		onOpenInfo: () => void;
		recorder: CanvasRecorder;
		toggleRecording: () => void;
		viewOnly?: boolean;
	}

	let {
		authorId,
		authorName,
		buildTime,
		canRecordVideo = true,
		captureScreenshot,
		isSavingLocally = false,
		recorder,
		onFork,
		onOpenInfo,
		toggleRecording,
		viewOnly = false,
	}: Props = $props();

	function formatDuration(milliseconds: number): string {
		const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
		return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
	}

	const recordTitle = $derived.by(() => {
		if (!canRecordVideo) return 'Video recording is not supported in this browser';
		if (recorder.isRecording) return `Stop recording at ${formatDuration(recorder.elapsedMs)} / ${formatDuration(CanvasRecorder.limitMs)}`;
		return `Start video recording (${CanvasRecorder.limitMs / 60_000} minute limit)`;
	});
</script>

<div class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-panel px-2 py-1 text-xs text-muted sm:gap-3 sm:px-3 sm:py-2">
	<span class={['size-3 shrink-0 rounded-full', recorder.isRecording ? 'bg-red-400 shadow-[0_0_0_4px_rgb(248_113_113/0.12)]' : 'bg-green-400']}></span>
	<span class="hidden shrink-0 font-medium tracking-wider sm:inline">Preview</span>
	<span class="shrink-0 text-subtle">•</span>
	<span class="shrink-0"><span class="hidden sm:inline">Build: </span>{buildTime.toFixed(2)}ms</span>

	<div class="ml-auto flex min-w-0 items-center gap-2">
		{#if isSavingLocally}
			<span class="shrink-0 rounded border border-yellow-600/60 bg-yellow-950/40 px-2 py-0.5 text-yellow-400" title="Log in to save shaders to your account">
				Local draft
			</span>
		{/if}

		<button
			onclick={captureScreenshot}
			class="flex shrink-0 items-center gap-1 rounded border border-border bg-surface/70 px-2 py-0.5 text-muted transition-colors hover:border-accent/40 hover:text-foreground"
			title="Capture screenshot as WebP"
		>
			<Camera size={11} />
			<span class="hidden sm:inline">Screenshot</span>
		</button>

		<button
			onclick={toggleRecording}
			disabled={!canRecordVideo}
			aria-pressed={recorder.isRecording}
			class={[
				'flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 transition-colors disabled:opacity-40',
				recorder.isRecording
					? 'border-red-500/50 bg-red-950/35 text-red-300 hover:border-red-400 hover:text-red-200'
					: 'border-border bg-surface/70 text-muted hover:border-red-500/40 hover:text-foreground',
			]}
			title={recordTitle}
		>
			{#if recorder.isRecording}
				<Square size={11} />
				<span class="hidden sm:inline">Stop</span>
			{:else}
				<Circle size={11} />
				<span class="hidden sm:inline">Record</span>
			{/if}
		</button>

		{#if recorder.isRecording}
			<span class="shrink-0 rounded border border-red-500/40 bg-red-950/25 px-2 py-1 font-mono text-10 text-red-300">
				{formatDuration(recorder.elapsedMs)} / {formatDuration(CanvasRecorder.limitMs)}
			</span>
		{/if}

		<div class="flex shrink-0 items-center gap-1">
			{#if authorId && authorName}
				<a href={getUserProfilePath(authorId)} class="transition-colors hover:text-foreground">{authorName}</a>
				<span>/</span>
			{/if}
			{#if viewOnly}
				<span class="max-w-24 truncate font-semibold text-foreground sm:max-w-40">{shaderState.name || 'Untitled Shader'}</span>
			{:else}
				<input
					type="text"
					bind:value={shaderState.name}
					placeholder="Untitled Shader"
					aria-label="Shader name"
					class="w-28 min-w-0 rounded border-none bg-transparent px-2 py-0.5 text-right font-semibold text-foreground outline-none transition-colors placeholder:text-subtle hover:bg-surface focus:bg-surface sm:w-40"
				/>
			{/if}
		</div>

		<button
			onclick={onOpenInfo}
			class="flex items-center gap-1 rounded border border-accent/40 bg-accent/5 px-2 py-0.5 text-accent/80 transition-colors hover:bg-accent/15 hover:text-accent"
			title="Shader info"
		>
			<Info size={11} />
			<span class="hidden sm:inline">Info</span>
		</button>

		{#if onFork && auth.isLoggedIn}
			<button
				onclick={onFork}
				disabled={shaderState.isSaving}
				class="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-muted transition-colors hover:text-foreground disabled:opacity-40"
				title={viewOnly ? 'Fork this shader into your account' : 'Fork this shader into a new copy'}
			>
				<GitFork size={11} />
				<span>{shaderState.isSaving ? 'Forking…' : 'Fork'}</span>
			</button>
		{/if}
	</div>
</div>
