<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowRight, CalendarDays, CodeXml, HardDrive, MailCheck, RefreshCw, TriangleAlert, Trash2 } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { auth, logout, requestVerification, throwIfAuthenticatedApiError } from '#features/auth/auth-client.svelte.js';
	import EditProfileSection from '#features/profile/EditProfileSection.svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import Button from '#components/ui/Button.svelte';
	import EmptyState from '#components/ui/EmptyState.svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import ShaderCard from '#features/shaders/preview/ShaderCard.svelte';
	import ShaderSortNav from '#features/shaders/preview/ShaderSortNav.svelte';
	import { getVisibilityOption } from '#features/shaders/model/shader-visibility.js';
	import { getAvatarUrl, pb } from '#lib/pocketbase.js';
	import { formatDate, plural } from '#lib/format.js';
	import { buildSiteUrl, getShaderPath, getUserProfilePath, type JsonLdNode, SITE_NAME, toIsoDate } from '#lib/site.js';
	import {
		createQuotaSummary,
		formatBytes,
		SHADER_IMAGE_MAX_BYTES,
		SHADER_VIDEO_MAX_BYTES,
	} from '#features/shaders/assets/shader-asset-policy.js';
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
	/** Shaders deleted on this page free their assets in the background, so their share is taken off the loaded R2 usage right away. */
	const deletedShaders = $derived(data.shaders.filter((shader) => deletedIds.has(shader.id)));
	const ownerQuota = $derived(createQuotaSummary((data.storage?.usedBytes ?? 0) - deletedShaders.reduce((total, shader) => total + shader.assetBytes, 0)));
	const uploadedMediaCount = $derived(Math.max(0, (data.storage?.mediaCount ?? 0) - deletedShaders.reduce((total, shader) => total + shader.mediaCount, 0)));
	const stats = $derived([
		{ label: 'Shaders', value: shaders.length },
		...(isOwner
			? [
				{ label: 'Public', value: shaders.filter((shader) => shader.visiblity === 'public').length },
				{ label: 'Unlisted', value: shaders.filter((shader) => shader.visiblity === 'unlisted').length },
				{ label: 'Private', value: shaders.filter((shader) => shader.visiblity === 'private').length },
			]
			: [{ label: 'Media', value: uploadedMediaCount }]),
	]);

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
	<Button href="/new" size="lg" class="self-start">
		Create a shader
		<ArrowRight size={14} />
	</Button>
{/snippet}

<div class="min-h-full bg-background text-foreground">
	<section class="relative isolate overflow-hidden border-b border-border">
		<div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_120%_at_15%_0%,--alpha(var(--color-accent)/14%),transparent_70%)]"></div>

		<div class="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-end sm:justify-between lg:px-10 lg:py-14">
			<div class="flex items-center gap-5">
				<div class="rounded-full bg-linear-to-br from-accent to-fuchsia-400 p-0.5 shadow-[0_0_40px_-8px_var(--color-accent)]">
					<div class="rounded-full bg-background p-0.5"><UserAvatar src={avatarUrl} alt="{displayName}'s avatar" size={20} /></div>
				</div>
				<div class="min-w-0">
					<h1 class="truncate text-3xl font-bold tracking-tight text-white sm:text-4xl">{displayName}</h1>
					<p class="mt-2 flex items-center gap-1.5 text-sm text-muted">
						<CalendarDays size={14} class="text-subtle" />
						Joined {formatDate(data.profileUser.created)}
					</p>
				</div>
			</div>

			{#if isOwner}{@render createShaderLink()}{/if}
		</div>

		<div class="mx-auto flex max-w-6xl flex-wrap gap-x-10 gap-y-4 px-6 pb-8 lg:px-10">
			{#each stats as stat (stat.label)}
				<div>
					<p class="text-2xl font-semibold text-white tabular-nums">{stat.value}</p>
					<p class="font-mono text-10 uppercase tracking-[0.16em] text-subtle">{stat.label}</p>
				</div>
			{/each}
		</div>
	</section>

	<div class="mx-auto max-w-6xl px-6 py-10 lg:px-10">
		{#if deleteError}
			<div class="alert-error mb-6 px-4 py-3">{deleteError}</div>
		{/if}

		<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<h2 class="text-xl font-semibold text-white">{isOwner ? 'Your library' : 'Shaders'}</h2>
				<p class="mt-1 text-sm text-muted">
					{isOwner ? 'Everything you made, including private and unlisted work.' : `Public work published by ${displayName}.`}
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
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
								<Button onclick={() => deleteShader(shader.id)} disabled={deletingId === shader.id} variant="danger" size="xs">
									{deletingId === shader.id ? 'Deleting…' : 'Confirm'}
								</Button>
								<Button onclick={() => (confirmId = null)} variant="ghost" size="xs">Cancel</Button>
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
			<section class="mt-16 border-t border-border pt-10">
				<h2 class="text-xl font-semibold text-white">Account settings</h2>
				<p class="mt-1 text-sm text-muted">Only you can see this part of the page.</p>

				<div class="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_22rem]">
					<EditProfileSection initialName={data.profileUser.name} />

					<div class="flex flex-col gap-4">
						{#if !(auth.user?.verified ?? data.profileUser.verified)}
							<div class="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
								<p class="flex items-center gap-2 text-sm font-medium text-yellow-300"><MailCheck size={15} /> Email not verified</p>
								<p class="mt-1.5 text-sm text-muted">Verify your email to unlock full features.</p>
								{#if resendError}
									<p class="mt-2 text-xs text-red-300">{resendError}</p>
								{/if}
								<Button onclick={resendVerificationCode} disabled={resendLoading} size="sm" class="mt-3">
									<RefreshCw size={12} class={resendLoading ? 'animate-spin' : ''} />
									{resendLoading ? 'Sending…' : 'Resend verification email'}
								</Button>
							</div>
						{/if}

						<div class="rounded-xl border border-border bg-surface p-5">
							<div class="flex items-center justify-between gap-3">
								<p class="flex items-center gap-2 text-sm font-medium text-foreground"><HardDrive size={15} class="text-accent" /> Storage</p>
								<p class="text-xs text-muted tabular-nums">{Math.round(ownerQuota.usedPercent)}% used</p>
							</div>
							<p class="mt-3 text-2xl font-semibold text-white tabular-nums">
								{formatBytes(ownerQuota.usedBytes)} <span class="text-sm font-normal text-subtle">/ {formatBytes(ownerQuota.totalBytes)}</span>
							</p>
							<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-panel">
								<div class="h-full rounded-full bg-linear-to-r from-accent to-sky-400 transition-[width] duration-300" style:width="{ownerQuota.usedPercent}%"></div>
							</div>
							<p class="mt-3 text-xs leading-5 text-muted">
								{plural(uploadedMediaCount, 'media item')}, {formatBytes(ownerQuota.remainingBytes)} left. Images up to {formatBytes(SHADER_IMAGE_MAX_BYTES)}, videos up to {formatBytes(SHADER_VIDEO_MAX_BYTES)}.
							</p>
						</div>

						<div class="rounded-xl border border-red-900/50 bg-red-950/10 p-5">
							<p class="flex items-center gap-2 text-sm font-medium text-red-400"><TriangleAlert size={15} /> Danger zone</p>
							{#if deleteAccountError}
								<div class="alert-error mt-3 px-3 py-2">{deleteAccountError}</div>
							{/if}
							{#if confirmDeleteAccount}
								<p class="mt-2 text-sm text-muted">This deletes your account, every shader and every upload. It can't be undone.</p>
								<div class="mt-3 flex flex-wrap items-center gap-2">
									<Button onclick={deleteAccount} disabled={deletingAccount} variant="danger">
										{deletingAccount ? 'Deleting…' : 'Yes, delete my account'}
									</Button>
									<Button onclick={() => (confirmDeleteAccount = false)} variant="ghost">Cancel</Button>
								</div>
							{:else}
								<p class="mt-2 text-sm text-muted">Delete your account with all its shaders and uploads.</p>
								<Button onclick={() => (confirmDeleteAccount = true)} variant="danger" class="mt-3">
									<Trash2 size={14} />
									Delete my account
								</Button>
							{/if}
						</div>
					</div>
				</div>
			</section>
		{/if}
	</div>
</div>
