<script lang="ts">
	import { Camera, Circle, GitFork, Info, Square } from '@lucide/svelte';
	import { auth } from '#features/auth/auth-client.svelte.js';
	import { CanvasRecorder } from '#features/shaders/canvas/canvas-capture.svelte.js';
	import { shaderState } from '#features/shaders/model/shader-state.svelte.js';

	interface Props {
		authorId?: string;
		authorName?: string;
		buildTime: number;
		canRecordVideo?: boolean;
		captureScreenshot: () => void;
		isSavingLocally?: boolean;
		onFork?: () => void;
		onOpenInfo: () => void;
		readonly?: boolean;
		recorder: CanvasRecorder;
		toggleRecording: () => void;
		viewOnly?: boolean;
	}

	let {
		authorId = undefined,
		authorName = undefined,
		buildTime,
		canRecordVideo = true,
		captureScreenshot,
		isSavingLocally = false,
		recorder,
		onFork = undefined,
		onOpenInfo,
		readonly = false,
		toggleRecording,
		viewOnly = false,
	}: Props = $props();

	function formatDuration(milliseconds: number): string {
		const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}
</script>

{#snippet infoButton()}
	<button
		onclick={onOpenInfo}
		class="flex cursor-pointer items-center gap-1 rounded border border-cyan-400/40 bg-cyan-400/5 px-2 py-0.5 text-cyan-400/80 transition-colors hover:bg-cyan-400/15 hover:text-cyan-400"
		title="Shader info"
	>
		<Info size={11} />
		<span class="hidden sm:inline">Informations</span>
	</button>
{/snippet}

{#snippet forkButton(title: string)}
	{#if onFork}
		<button
			onclick={onFork}
			disabled={shaderState.isSaving}
			class="flex cursor-pointer shrink-0 items-center gap-1 rounded px-2 py-0.5 text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:text-foreground"
			title={title}
		>
			<GitFork size={11} />
			<span>{shaderState.isSaving ? 'Forking…' : 'Fork'}</span>
		</button>
	{/if}
{/snippet}

{#snippet captureButtons()}
	<button
		onclick={captureScreenshot}
		class="flex cursor-pointer shrink-0 items-center gap-1 rounded border border-border bg-surface/70 px-2 py-0.5 text-muted transition-colors hover:border-cyan-400/40 hover:text-foreground"
		title="Capture screenshot as WebP"
	>
		<Camera size={11} />
		<span class="hidden sm:inline">Screenshot</span>
	</button>

	<button
		onclick={toggleRecording}
		disabled={!canRecordVideo}
		aria-pressed={recorder.isRecording}
		class={recorder.isRecording
			? 'flex cursor-pointer shrink-0 items-center gap-1 rounded border border-red-500/50 bg-red-950/35 px-2 py-0.5 text-red-300 transition-colors hover:border-red-400 hover:text-red-200'
			: 'flex cursor-pointer shrink-0 items-center gap-1 rounded border border-border bg-surface/70 px-2 py-0.5 text-muted transition-colors hover:border-red-500/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'}
		title={canRecordVideo
			? recorder.isRecording
				? `Stop recording at ${formatDuration(recorder.elapsedMs)} / ${formatDuration(CanvasRecorder.limitMs)}`
				: `Start video recording (${CanvasRecorder.limitMs / 60_000} minute limit)`
			: 'Video recording is not supported in this browser'}
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
{/snippet}

<div class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-panel px-2 py-1 text-xs text-muted sm:gap-3 sm:px-3 sm:py-2">
	<span class={recorder.isRecording ?'size-3 shrink-0 rounded-full bg-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.12)]' : 'size-3 shrink-0 rounded-full bg-green-400'}></span>
	<span class="hidden shrink-0 font-medium tracking-wider sm:inline">Preview</span>
	<span class="shrink-0 text-muted-foreground">•</span>
	<span class="shrink-0"><span class="hidden sm:inline">Build: </span>{buildTime.toFixed(2)}ms</span>

	{#if isSavingLocally}
		<span class="ml-auto rounded border border-yellow-600/60 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-400">
			Saved locally
		</span>
	{:else if viewOnly}
		<div class="ml-auto flex min-w-0 items-center gap-2">
			{@render captureButtons()}
			<div class="flex shrink-0 items-center gap-1 text-xs text-muted">
				{#if authorId && authorName}
					<a href="/users/{authorId}" class="transition-colors hover:text-foreground">{authorName}</a>
					<span>/</span>
				{/if}
				<span class="max-w-24 truncate text-xs sm:max-w-40 font-semibold text-foreground">{shaderState.name || 'Untitled Shader'}</span>
			</div>
			{@render infoButton()}
			{#if auth.isLoggedIn}
				{@render forkButton('Fork this shader into your account')}
			{/if}
		</div>
	{:else if !readonly && auth.isLoggedIn}
		<div class="ml-auto flex min-w-0 items-center gap-2">
			{@render captureButtons()}
			<div class="flex items-center gap-1">
				{#if authorId && authorName && authorId !== auth.user?.id}
					<a href="/users/{authorId}" class="text-xs text-muted transition-colors hover:text-foreground">{authorName}</a>
					<span class="text-xs text-muted">/</span>
				{/if}
				<input
					type="text"
					bind:value={shaderState.name}
					placeholder="Untitled Shader"
					class="w-28 min-w-0 rounded sm:w-40 border-none bg-transparent px-2 py-0.5 text-right text-xs font-semibold text-foreground outline-none transition-colors placeholder:text-subtle hover:bg-surface focus:bg-surface"
				/>
			</div>
			{@render infoButton()}
			{@render forkButton('Fork this shader into a new copy')}
		</div>
	{/if}
</div>
