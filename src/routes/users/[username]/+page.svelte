<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		CodeXml,
		Globe,
		Link,
		Lock,
		MailCheck,
		RefreshCw,
		Trash2,
		User,
	} from '@lucide/svelte';
	import { auth, logout, requestVerification, throwIfAuthenticatedApiError } from '$lib/auth.svelte';
	import EditProfileSection from '$lib/components/EditProfileSection.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import { pb } from '$lib/pocketbase';
	import {
		SHADER_IMAGE_MAX_BYTES,
		SHADER_VIDEO_MAX_BYTES,
		createQuotaSummary,
		formatBytes,
	} from '$lib/shader-asset-policy';
	import {
		getShaderSortLabel,
		SHADER_SORT_OPTIONS,
		type ShaderSort,
	} from '$lib/shader-list';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type ShaderItem = PageProps['data']['shaders'][number];
	const isOwner = $derived(data.isOwner);
	const displayName = $derived(isOwner ? (auth.user?.name ?? data.profileUser.name) : data.profileUser.name);
	const isVerified = $derived(auth.user?.verified ?? data.profileUser.verified);
	const ownerAvatarUrl = $derived(
		isOwner
			? (
				auth.user?.avatar && auth.user?.id
					? `${pb.baseURL}/api/files/users/${auth.user.id}/${auth.user.avatar}`
					: data.profileUser.avatarUrl
			)
			: null
	);

	const title = $derived(`${displayName}'s Shaders - Shayders`);
	const description = $derived(`Explore GLSL shader creations by ${displayName}. ${data.shaders.length} public shader${data.shaders.length !== 1 ? 's' : ''} available.`);
	const currentSortLabel = $derived(getShaderSortLabel(data.selectedSort));

	let deletedIds = $state(new Set<string>());
	let deletingId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);
	let deleteError = $state('');

	let resendLoading = $state(false);
	let resendError = $state('');

	async function resendVerificationCode() {
		if (!auth.user?.email) return;
		resendLoading = true;
		resendError = '';
		try {
			await requestVerification(auth.user.email);
			const params = new URLSearchParams({ email: auth.user.email });
			goto(`/verify-email?${params}`);
		} catch (err) {
			resendError = err instanceof Error ? err.message : 'Failed to send verification email.';
			resendLoading = false;
		}
	}

	const ownerQuota = $derived.by(() => {
		if (!isOwner) {
			return null;
		}

		const usedBytes = data.shaders
			.filter((shader) => !deletedIds.has(shader.id))
			.reduce((total, shader) => total + shader.assetBytes, 0);

		return createQuotaSummary(usedBytes);
	});

	const shaders = $derived.by<ShaderItem[]>(() => {
		return data.shaders.filter((shader) => !deletedIds.has(shader.id));
	});

	const uploadedMediaCount = $derived.by(() => (
		shaders.reduce((total, shader) => total + shader.mediaCount, 0)
	));

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	function sortHref(sort: ShaderSort) {
		return `?sort=${sort}`;
	}

	async function deleteShader(id: string) {
		deletingId = id;
		deleteError = '';
		try {
			const res = await fetch(`/api/shaders/${id}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${pb.authStore.token}`,
				},
			});
			await throwIfAuthenticatedApiError(res, `Delete shader failed with HTTP ${res.status}.`);
			deletedIds = new Set([...deletedIds, id]);
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Failed to delete shader.';
			console.error('Failed to delete shader', e);
		} finally {
			deletingId = null;
			confirmId = null;
		}
	}

	const visibilityConfig = {
		private: { icon: Lock, label: 'Private', cls: 'text-red-400 border-red-900/50 bg-red-950/30' },
		public: { icon: Globe, label: 'Public', cls: 'text-green-400 border-green-900/50 bg-green-950/30' },
		unlisted: { icon: Link, label: 'Unlisted', cls: 'text-yellow-400 border-yellow-900/50 bg-yellow-950/30' },
	} as const;

	let confirmDeleteAccount = $state(false);
	let deletingAccount = $state(false);
	let deleteAccountError = $state('');

	async function deleteAccount() {
		deletingAccount = true;
		deleteAccountError = '';
		try {
			await pb.collection('users').delete(data.profileUser.id);
			logout();
			goto('/');
		} catch (e) {
			deleteAccountError = e instanceof Error ? e.message : 'Failed to delete account.';
			deletingAccount = false;
			confirmDeleteAccount = false;
		}
	}
</script>

<SeoHead
	{title}
	{description}
	ogType="profile"
/>

<div class="min-h-full bg-background text-foreground p-6 lg:p-10">
	<div class="mx-auto max-w-5xl">
		<div class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex items-start gap-4">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-panel">
					{#if ownerAvatarUrl}
						<img src={ownerAvatarUrl} alt="Avatar" class="h-full w-full object-cover" />
					{:else}
						<User size={26} class="text-muted" />
					{/if}
				</div>

				<div>
					<h1 class="text-2xl font-semibold text-foreground">{displayName}</h1>
					<p class="mt-1 text-sm text-muted">
						{#if isOwner}
							Manage your shaders and uploads.
						{:else}
							Public shaders by {displayName}.
						{/if}
					</p>
					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
						<span>{shaders.length} shader{shaders.length !== 1 ? 's' : ''}</span>
						<span>Sorted by {currentSortLabel.toLowerCase()}</span>
					</div>
				</div>
			</div>

			{#if isOwner}
				<a
					href="/new"
					class="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-panel"
				>
					Create a shader
					<ArrowRight size={14} />
				</a>
			{/if}
		</div>

		{#if deleteError}
			<div class="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
				{deleteError}
			</div>
		{/if}

		<div class="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<p class="text-sm font-medium text-foreground">{isOwner ? 'Your shader library' : 'Public shaders'}</p>
				<p class="text-xs text-muted">
					{#if isOwner}
						Sort your full library, including private and unlisted work.
					{:else}
						Browse the public work published by {displayName}.
					{/if}
				</p>
			</div>

			<nav aria-label="Sort profile shaders" class="flex flex-wrap gap-2">
				{#each SHADER_SORT_OPTIONS as option (option.value)}
					<a
						href={sortHref(option.value)}
						aria-current={data.selectedSort === option.value ? 'page' : undefined}
						class={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors ${data.selectedSort === option.value ? 'border-subtle bg-panel text-foreground' : 'border-border text-muted hover:bg-panel hover:text-foreground'}`}
					>
						{option.label}
					</a>
				{/each}
			</nav>
		</div>

		{#if shaders.length === 0}
			<div class="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted">
				<CodeXml size={40} class="opacity-30" />
				<p class="text-base text-foreground">No shaders yet.</p>
				<p class="max-w-md text-sm text-muted">
					{#if isOwner}
						Start with a new shader and build out your library from here.
					{:else}
						This profile has not published any public shaders yet.
					{/if}
				</p>
				{#if isOwner}
					<a
						href="/new"
						class="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-panel"
					>
						Create a shader
						<ArrowRight size={14} />
					</a>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each shaders as shader (shader.id)}
					{@const vis = visibilityConfig[shader.visiblity] ?? visibilityConfig.public}
					{@const VisIcon = vis.icon}
					<div class="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-subtle">
						<a href="/shader/{shader.id}" class="relative block h-36 overflow-hidden bg-black">
							{#if shader.buffers && shader.buffers.length > 0}
								<ShaderPreview
									buffers={shader.buffers}
									channels={shader.channels}
									name={shader.name}
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
									<CodeXml size={20} class="text-muted opacity-30" />
								</div>
							{/if}

							{#if isOwner && confirmId !== shader.id}
								<div class="absolute right-3 top-3">
									<button
										onclick={(event) => {
											event.preventDefault();
											confirmId = shader.id;
										}}
										class="rounded-md bg-black/60 p-1.5 text-muted opacity-0 transition-all hover:text-red-300 group-hover:opacity-100 cursor-pointer"
										title="Delete shader"
									>
										<Trash2 size={14} />
									</button>
								</div>
							{/if}
						</a>

						<div class="flex flex-1 flex-col gap-2 p-3">
							<div class="flex items-start justify-between gap-3">
								<a href="/shader/{shader.id}" class="min-w-0 truncate text-sm font-medium text-foreground transition-colors hover:text-white">
									{shader.name}
								</a>
								<span class="shrink-0 whitespace-nowrap text-xs text-subtle">{formatDate(shader.created)}</span>
							</div>

							{#if isOwner && confirmId === shader.id}
								<div class="flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-100">
									<span class="flex-1">Delete this shader?</span>
									<button
										onclick={() => deleteShader(shader.id)}
										disabled={deletingId === shader.id}
										class="rounded-md border border-red-900/50 bg-red-950/60 px-2 py-1 text-red-300 transition-colors hover:bg-red-900/60 disabled:opacity-50 cursor-pointer"
									>
										{deletingId === shader.id ? 'Deleting…' : 'Confirm'}
									</button>
									<button
										onclick={() => (confirmId = null)}
										class="rounded-md bg-panel px-2 py-1 text-muted transition-colors hover:text-foreground cursor-pointer"
									>
										Cancel
									</button>
								</div>
							{/if}

							{#if shader.description}
								<p class="line-clamp-2 text-xs leading-5 text-muted">{shader.description}</p>
							{:else}
								<p class="text-xs leading-5 text-subtle">No description yet.</p>
							{/if}

							<div class="mt-auto flex items-center justify-between gap-3 pt-1">
								<span class="text-xs text-subtle">{shader.mediaCount} media item{shader.mediaCount !== 1 ? 's' : ''}</span>
								{#if isOwner}
									<span class={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${vis.cls}`}>
										<VisIcon size={10} />
										{vis.label}
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if isOwner}
				<div class="mt-8 rounded-xl border border-border bg-surface px-4 py-4 sm:px-5">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p class="text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300/80">Storage quota</p>
							{#if ownerQuota}
								<p class="mt-1 text-lg font-semibold text-foreground">
									{formatBytes(ownerQuota.usedBytes)} / {formatBytes(ownerQuota.totalBytes)}
								</p>
								<p class="text-xs text-muted">
									{formatBytes(ownerQuota.remainingBytes)} remaining. Images up to {formatBytes(SHADER_IMAGE_MAX_BYTES)}, videos up to {formatBytes(SHADER_VIDEO_MAX_BYTES)}.
								</p>
							{:else}
								<p class="mt-1 text-sm text-muted">Calculating your storage usage…</p>
							{/if}
						</div>

						<div class="text-sm text-muted sm:text-right">
							{#if ownerQuota}
								<p>{Math.round(ownerQuota.usedPercent)}% used</p>
							{/if}
							<p>{uploadedMediaCount} media item{uploadedMediaCount !== 1 ? 's' : ''} uploaded</p>
						</div>
					</div>

					<div class="mt-3 h-2 overflow-hidden rounded-full bg-panel">
						<div
							class="h-full rounded-full bg-linear-to-r from-cyan-400 to-sky-400 transition-[width] duration-300"
							style={`width: ${ownerQuota?.usedPercent ?? 0}%`}
						></div>
					</div>
				</div>
			{/if}
		{/if}

		{#if isOwner && !isVerified}
			<div class="mt-12 border-t border-border pt-8">
				<div class="flex items-start gap-3">
					<MailCheck size={16} class="mt-1 shrink-0 text-yellow-400" />
					<div class="flex-1">
						<p class="text-sm font-medium text-foreground">Email not verified</p>
						<p class="mt-1 text-sm text-muted">Verify your email to unlock full features.</p>
						{#if resendError}
							<p class="mt-2 text-xs text-red-300">{resendError}</p>
						{/if}
						<button
							onclick={resendVerificationCode}
							disabled={resendLoading}
							class="mt-3 flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
						>
							<RefreshCw size={12} class={resendLoading ? 'animate-spin' : ''} />
							{resendLoading ? 'Sending…' : 'Resend code'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if isOwner}
			<EditProfileSection initialName={data.profileUser.name} />
		{/if}

		{#if isOwner}
			<div class="mt-16 border-t border-border pt-8">
				<h2 class="mb-3 text-sm font-semibold text-red-400">Danger zone</h2>
				{#if deleteAccountError}
					<div class="mb-3 rounded bg-red-950/30 px-3 py-2 text-sm text-red-300">{deleteAccountError}</div>
				{/if}
				{#if confirmDeleteAccount}
					<div class="flex flex-wrap items-center gap-3">
						<span class="text-sm text-muted">Are you sure? This cannot be undone.</span>
						<button
							onclick={deleteAccount}
							disabled={deletingAccount}
							class="rounded border border-red-700/50 bg-red-950/60 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/60 disabled:opacity-50 cursor-pointer"
						>
							{deletingAccount ? 'Deleting…' : 'Yes, delete my account'}
						</button>
						<button
							onclick={() => (confirmDeleteAccount = false)}
							class="px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground cursor-pointer"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						onclick={() => (confirmDeleteAccount = true)}
						class="flex items-center gap-2 rounded border border-red-900/50 bg-red-950/20 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-950/50 cursor-pointer"
					>
						<Trash2 size={14} />
						Delete my account
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
