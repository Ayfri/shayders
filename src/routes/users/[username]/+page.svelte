<script lang="ts">
	import type { PageData } from './$types';
	import { auth, logout, requestVerification } from '$lib/auth.svelte';
	import { pb } from '$lib/pocketbase';
	import { goto } from '$app/navigation';
	import { User, Trash2, Globe, Link, Lock, CodeXml, MailCheck, RefreshCw } from '@lucide/svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import type { ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';
	import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';

	let { data }: { data: PageData } = $props();

	const isOwner = $derived(auth.isLoggedIn && auth.user?.id === data.profileUser.id);

	type ShaderItem = {
		id: string;
		name: string;
		description: string;
		created: string;
		updated: string;
		visiblity: keyof typeof ShadersVisiblityOptions;
		buffers?: ShaderBuffer[];
	};

	let ownerShaders = $state<ShaderItem[] | null>(null);
	let deletedIds = $state(new Set<string>());
	let deletingId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);

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

	$effect(() => {
		if (isOwner) {
			pb.collection('shaders')
				.getList(1, 100, {
					filter: pb.filter('user_id = {:userId}', { userId: data.profileUser.id }),
					sort: '-created',
				})
				.then((res) => {
					ownerShaders = res.items.map((s) => ({
						id: s.id,
						name: s.name,
						description: s.description ?? '',
						created: s.created,
						updated: s.updated,
						visiblity: (s.visiblity ?? 'public') as keyof typeof ShadersVisiblityOptions,
						buffers: Array.isArray(s.content) ? (s.content as ShaderBuffer[]) : [],
					}));
				})
				.catch(() => { ownerShaders = []; });
		}
	});

	const shaders = $derived<ShaderItem[]>(
		(isOwner ? (ownerShaders ?? data.shaders) : data.shaders)
			.filter((s) => !deletedIds.has(s.id))
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	async function deleteShader(id: string) {
		deletingId = id;
		try {
			await pb.collection('shaders').delete(id);
			deletedIds = new Set([...deletedIds, id]);
		} catch (e) {
			console.error('Failed to delete shader', e);
		} finally {
			deletingId = null;
			confirmId = null;
		}
	}

	const visibilityConfig = {
		public:   { icon: Globe, label: 'Public',    cls: 'text-green-400 border-green-900/50 bg-green-950/30' },
		unlisted: { icon: Link,  label: 'Unlisted',  cls: 'text-yellow-400 border-yellow-900/50 bg-yellow-950/30' },
		private:  { icon: Lock,  label: 'Private',   cls: 'text-red-400 border-red-900/50 bg-red-950/30' },
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

<div class="min-h-full overflow-y-auto bg-background text-foreground p-6 lg:p-10">
	<div class="max-w-5xl mx-auto">
		<div class="flex items-center gap-4 mb-10">
			<div class="w-14 h-14 rounded-full bg-panel border border-border flex items-center justify-center shrink-0">
				<User size={26} class="text-muted" />
			</div>
			<div>
				<h1 class="text-xl font-semibold text-foreground">{data.profileUser.name}</h1>
			</div>
			<div class="ml-auto text-sm text-muted">
				{shaders.length} shader{shaders.length !== 1 ? 's' : ''}
			</div>
		</div>

		{#if shaders.length === 0}
			<div class="flex flex-col items-center justify-center py-24 gap-3 text-muted">
				<CodeXml size={40} class="opacity-30" />
				<p class="text-sm">No shaders yet.</p>
				{#if isOwner}
					<a
						href="/new"
						class="mt-2 px-4 py-1.5 rounded bg-panel border border-border text-sm text-foreground hover:bg-surface transition-colors"
					>
						Create a shader
					</a>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each shaders as shader (shader.id)}
					{@const vis = visibilityConfig[shader.visiblity] ?? visibilityConfig.public}
					{@const VisIcon = vis.icon}
					<div class="group rounded-lg border border-border bg-surface overflow-hidden flex flex-col hover:border-subtle transition-colors">
						<a
							href="/shader/{shader.id}"
							class="block h-36 relative overflow-hidden bg-black group-hover:brightness-110 transition-all"
						>
							{#if shader.buffers && shader.buffers.length > 0}
								<ShaderPreview
									buffers={shader.buffers}
									shaderId={shader.id}
									name={shader.name}
								/>
							{:else}
								<div class="w-full h-full bg-linear-to-br from-panel via-background to-panel flex items-center justify-center">
									<CodeXml size={20} class="text-muted opacity-30" />
								</div>
							{/if}
						</a>
						<div class="p-3 flex flex-col gap-1 flex-1">
							<div class="flex items-start justify-between gap-2">
								<a
									href="/shader/{shader.id}"
									class="font-medium text-sm text-foreground hover:text-white transition-colors truncate"
								>
									{shader.name}
								</a>
								{#if isOwner}
									{#if confirmId === shader.id}
										<div class="flex items-center gap-1 shrink-0">
											<button
												onclick={() => deleteShader(shader.id)}
												disabled={deletingId === shader.id}
												class="text-xs px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900/50 hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-50"
											>
													{deletingId === shader.id ? '...' : 'Confirm'}
											</button>
											<button
												onclick={() => (confirmId = null)}
												class="text-xs px-2 py-0.5 rounded bg-panel text-muted hover:text-foreground transition-colors cursor-pointer"
											>
												Cancel
											</button>
										</div>
									{:else}
										<button
											onclick={() => (confirmId = shader.id)}
											class="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-muted hover:text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
											title="Delete"
										>
											<Trash2 size={13} />
										</button>
									{/if}
								{/if}
							</div>

							{#if shader.description}
								<p class="text-xs text-muted line-clamp-2">{shader.description}</p>
							{/if}

							<div class="flex items-center justify-between mt-auto pt-1">
								<p class="text-xs text-subtle">{formatDate(shader.created)}</p>
								{#if isOwner}
									<span class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border {vis.cls}">
										<VisIcon size={10} />
										{vis.label}
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if isOwner && auth.user && !auth.user.verified}
			<div class="mt-12 border-t border-border pt-8">
				<div class="flex items-start gap-3">
					<MailCheck size={16} class="text-yellow-400 shrink-0 mt-1" />
					<div class="flex-1">
						<p class="text-sm text-foreground font-medium">Email not verified</p>
						<p class="text-sm text-muted mt-1">Verify your email to unlock full features.</p>
						{#if resendError}
							<p class="text-xs text-red-300 mt-2">{resendError}</p>
						{/if}
						<button
							onclick={resendVerificationCode}
							disabled={resendLoading}
							class="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded text-foreground border border-border hover:bg-panel disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
						>
							<RefreshCw size={12} class={resendLoading ? 'animate-spin' : ''} />
							{resendLoading ? 'Sending…' : 'Resend code'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if isOwner}
			<div class="mt-16 border-t border-border pt-8">
				<h2 class="text-sm font-semibold text-red-400 mb-3">Danger zone</h2>
				{#if deleteAccountError}
					<div class="mb-3 px-3 py-2 rounded bg-red-950/30 border border-red-700/50 text-red-300 text-sm">{deleteAccountError}</div>
				{/if}
				{#if confirmDeleteAccount}
					<div class="flex items-center gap-3">
						<span class="text-sm text-muted">Are you sure? This cannot be undone.</span>
						<button
							onclick={deleteAccount}
							disabled={deletingAccount}
							class="px-3 py-1.5 rounded text-sm font-medium bg-red-950/60 text-red-400 border border-red-700/50 hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-50"
						>
							{deletingAccount ? 'Deleting…' : 'Yes, delete my account'}
						</button>
						<button
							onclick={() => (confirmDeleteAccount = false)}
							class="px-3 py-1.5 rounded text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
						>Cancel</button>
					</div>
				{:else}
					<button
						onclick={() => (confirmDeleteAccount = true)}
						class="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-red-400 border border-red-900/50 bg-red-950/20 hover:bg-red-950/50 transition-colors cursor-pointer"
					>
						<Trash2 size={14} />
						Delete my account
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
