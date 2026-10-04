<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowRight, CodeXml, MailCheck, RefreshCw, Trash2 } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { auth, logout, requestVerification, throwIfAuthenticatedApiError } from '#features/auth/auth-client.svelte.js';
	import EditProfileSection from '#features/profile/EditProfileSection.svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import EmptyState from '#components/ui/EmptyState.svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import ShaderCard from '#features/shaders/preview/ShaderCard.svelte';
	import ShaderSortNav from '#features/shaders/preview/ShaderSortNav.svelte';
	import { getVisibilityOption } from '#features/shaders/model/shader-visibility.js';
	import { getAvatarUrl, pb } from '#lib/pocketbase.js';
	import { plural } from '#lib/format.js';
	import { buildSiteUrl, getShaderPath, getUserProfilePath, type JsonLdNode, SITE_NAME, toIsoDate } from '#lib/site.js';
	import {
		createQuotaSummary,
		formatBytes,
		SHADER_IMAGE_MAX_BYTES,
		SHADER_VIDEO_MAX_BYTES,
	} from '#features/shaders/assets/shader-asset-policy.js';
	import { getShaderSortLabel } from '#features/shaders/model/shader-list.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isOwner = $derived(data.isOwner);
	const displayName = $derived((isOwner && auth.user?.name) || data.profileUser.name);
	const avatarUrl = $derived((isOwner && auth.user && getAvatarUrl(auth.user)) || data.profileUser.avatarUrl);

	const publicShaders = $derived(data.shaders.filter((shader) => shader.visiblity === 'public'));
	const profileUrl = $derived(buildSiteUrl(getUserProfilePath(data.profileUser.id)));
	const jsonLd = $derived<JsonLdNode>({
		'@type': 'ProfilePage',
		mainEntity: {
			'@id': `${profileUrl}#person`,
			'@type': 'Person',
			image: data.profileUser.avatarUrl ?? undefined,
			name: data.profileUser.name,
			url: profileUrl,
		},
		hasPart: publicShaders.map((shader) => ({
			'@type': 'SoftwareSourceCode',
			author: { '@id': `${profileUrl}#person` },
			dateCreated: toIsoDate(shader.created),
			name: shader.name,
			programmingLanguage: 'GLSL',
			url: buildSiteUrl(getShaderPath(shader.id)),
		})),
		url: profileUrl,
	});

	const deletedIds = new SvelteSet<string>();
	let confirmId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let deleteError = $state('');

	let resendLoading = $state(false);
	let resendError = $state('');

	let confirmDeleteAccount = $state(false);
	let deletingAccount = $state(false);
	let deleteAccountError = $state('');

	const shaders = $derived(data.shaders.filter((shader) => !deletedIds.has(shader.id)));
	const ownerQuota = $derived(createQuotaSummary(shaders.reduce((total, shader) => total + shader.assetBytes, 0)));
	const uploadedMediaCount = $derived(shaders.reduce((total, shader) => total + shader.mediaCount, 0));

	async function resendVerificationCode() {
		if (!auth.user?.email) return;
		resendLoading = true;
		resendError = '';
		try {
			await requestVerification(auth.user.email);
			goto(`/verify-email?${new URLSearchParams({ email: auth.user.email })}`);
		} catch (err) {
			resendError = err instanceof Error ? err.message : 'Failed to send verification email.';
			resendLoading = false;
		}
	}

	async function deleteShader(id: string) {
		deletingId = id;
		deleteError = '';
		try {
			const response = await fetch(`/api/shaders/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${pb.authStore.token}` },
			});
			await throwIfAuthenticatedApiError(response, `Delete shader failed with HTTP ${response.status}.`);
			deletedIds.add(id);
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Failed to delete shader.';
		} finally {
			deletingId = null;
			confirmId = null;
		}
	}

	async function deleteAccount() {
		deletingAccount = true;
		deleteAccountError = '';
		try {
			const response = await fetch('/api/account', {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${pb.authStore.token}` },
			});
			await throwIfAuthenticatedApiError(response, `Delete account failed with HTTP ${response.status}.`);
			logout();
			goto('/');
		} catch (err) {
			deleteAccountError = err instanceof Error ? err.message : 'Failed to delete account.';
			deletingAccount = false;
			confirmDeleteAccount = false;
		}
	}
</script>

<SeoHead
	title="{data.profileUser.name}'s Shaders - {SITE_NAME}"
	description="Explore GLSL shader creations by {data.profileUser.name}. {plural(publicShaders.length, 'public shader')} available."
	ogType="profile"
	ogImage={data.profileUser.avatarUrl ?? undefined}
	ogImageAlt={data.profileUser.avatarUrl ? `${data.profileUser.name}'s avatar` : undefined}
	robots={publicShaders.length > 0 ? undefined : 'noindex, follow'}
	{jsonLd}
/>

{#snippet createShaderLink()}
	<a href="/new" class="btn-secondary self-start px-4 py-2 text-sm">
		Create a shader
		<ArrowRight size={14} />
	</a>
{/snippet}

<div class="min-h-full bg-background p-6 text-foreground lg:p-10">
	<div class="mx-auto max-w-5xl">
		<div class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex items-start gap-4">
				<UserAvatar src={avatarUrl} alt="{displayName}'s avatar" class="size-14" />
				<div>
					<h1 class="text-2xl font-semibold text-foreground">{displayName}</h1>
					<p class="mt-1 text-sm text-muted">{isOwner ? 'Manage your shaders and uploads.' : `Public shaders by ${displayName}.`}</p>
					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
						<span>{plural(shaders.length, 'shader')}</span>
						<span>Sorted by {getShaderSortLabel(data.selectedSort).toLowerCase()}</span>
					</div>
				</div>
			</div>

			{#if isOwner}{@render createShaderLink()}{/if}
		</div>

		{#if deleteError}
			<div class="alert-error mb-6 px-4 py-3">{deleteError}</div>
		{/if}

		<div class="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<p class="text-sm font-medium text-foreground">{isOwner ? 'Your shader library' : 'Public shaders'}</p>
				<p class="text-xs text-muted">
					{isOwner ? 'Sort your full library, including private and unlisted work.' : `Browse the public work published by ${displayName}.`}
				</p>
			</div>
			<ShaderSortNav label="Sort profile shaders" selected={data.selectedSort} />
		</div>

		{#if shaders.length === 0}
			<EmptyState icon={CodeXml} title="No shaders yet.">
				{#if isOwner}
					Start with a new shader and build out your library from here.
					{@render createShaderLink()}
				{:else}
					This profile has not published any public shaders yet.
				{/if}
			</EmptyState>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each shaders as shader (shader.id)}
					{@const visibility = getVisibilityOption(shader.visiblity)}
					<ShaderCard {shader}>
						{#snippet overlay()}
							{#if isOwner && confirmId !== shader.id}
								<button
									onclick={() => (confirmId = shader.id)}
									aria-label="Delete shader"
									title="Delete shader"
									class="absolute right-3 top-3 rounded-md bg-black/60 p-1.5 text-muted opacity-0 transition-all hover:text-red-300 group-hover:opacity-100 pointer-coarse:opacity-100"
								>
									<Trash2 size={14} />
								</button>
							{/if}
						{/snippet}

						{#if isOwner && confirmId === shader.id}
							<div class="alert-error flex items-center gap-2 px-3 py-2 text-xs">
								<span class="flex-1">Delete this shader?</span>
								<button onclick={() => deleteShader(shader.id)} disabled={deletingId === shader.id} class="btn-danger px-2 py-1">
									{deletingId === shader.id ? 'Deleting…' : 'Confirm'}
								</button>
								<button onclick={() => (confirmId = null)} class="btn-ghost px-2 py-1">Cancel</button>
							</div>
						{/if}

						<div class="mt-auto flex items-center justify-between gap-3 pt-1">
							<span class="text-xs text-subtle">{plural(shader.mediaCount, 'media item')}</span>
							{#if isOwner}
								<span class={['inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs', visibility.badgeClass]}>
									<visibility.icon size={10} />
									{visibility.label}
								</span>
							{/if}
						</div>
					</ShaderCard>
				{/each}
			</div>
		{/if}

		{#if isOwner}
			<div class="mt-8 rounded-xl border border-border bg-surface p-4 sm:px-5">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p class="font-mono text-11 uppercase tracking-[0.2em] text-subtle">Storage quota</p>
						<p class="mt-1 text-lg font-semibold text-foreground">
							{formatBytes(ownerQuota.usedBytes)} / {formatBytes(ownerQuota.totalBytes)}
						</p>
						<p class="text-xs text-muted">
							{formatBytes(ownerQuota.remainingBytes)} remaining. Images up to {formatBytes(SHADER_IMAGE_MAX_BYTES)}, videos up to {formatBytes(SHADER_VIDEO_MAX_BYTES)}.
						</p>
					</div>
					<div class="text-sm text-muted sm:text-right">
						<p>{Math.round(ownerQuota.usedPercent)}% used</p>
						<p>{plural(uploadedMediaCount, 'media item')} uploaded</p>
					</div>
				</div>
				<div class="mt-3 h-2 overflow-hidden rounded-full bg-panel">
					<div class="h-full rounded-full bg-linear-to-r from-accent to-sky-400 transition-[width] duration-300" style:width="{ownerQuota.usedPercent}%"></div>
				</div>
			</div>

			{#if !(auth.user?.verified ?? data.profileUser.verified)}
				<div class="mt-12 flex items-start gap-3 border-t border-border pt-8">
					<MailCheck size={16} class="mt-1 shrink-0 text-yellow-400" />
					<div class="flex-1">
						<p class="text-sm font-medium text-foreground">Email not verified</p>
						<p class="mt-1 text-sm text-muted">Verify your email to unlock full features.</p>
						{#if resendError}
							<p class="mt-2 text-xs text-red-300">{resendError}</p>
						{/if}
						<button onclick={resendVerificationCode} disabled={resendLoading} class="btn-secondary mt-3 px-3 py-1.5 text-xs">
							<RefreshCw size={12} class={resendLoading ? 'animate-spin' : ''} />
							{resendLoading ? 'Sending…' : 'Resend verification email'}
						</button>
					</div>
				</div>
			{/if}

			<EditProfileSection initialName={data.profileUser.name} />

			<div class="mt-16 border-t border-border pt-8">
				<h2 class="mb-3 text-sm font-semibold text-red-400">Danger zone</h2>
				{#if deleteAccountError}
					<div class="alert-error mb-3 px-3 py-2">{deleteAccountError}</div>
				{/if}
				{#if confirmDeleteAccount}
					<div class="flex flex-wrap items-center gap-3">
						<span class="text-sm text-muted">This deletes your account, every shader and every upload. It can't be undone.</span>
						<button onclick={deleteAccount} disabled={deletingAccount} class="btn-danger px-3 py-1.5 text-sm font-medium">
							{deletingAccount ? 'Deleting…' : 'Yes, delete my account'}
						</button>
						<button onclick={() => (confirmDeleteAccount = false)} class="px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground">
							Cancel
						</button>
					</div>
				{:else}
					<button onclick={() => (confirmDeleteAccount = true)} class="btn-danger px-3 py-1.5 text-sm">
						<Trash2 size={14} />
						Delete my account
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
