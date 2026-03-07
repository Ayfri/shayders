<script lang="ts">
	import { pb } from '$lib/pocketbase';
	import { auth } from '$lib/auth.svelte';
	import { Camera, Check, Eye, EyeOff, KeyRound, RefreshCw, User } from '@lucide/svelte';

	interface Props {
		initialName?: string;
	}

	let { initialName = '' }: Props = $props();

	const initialDisplayName = $derived(auth.user?.name ?? initialName);

	let name = $state('');
	let nameLoading = $state(false);
	let nameError = $state('');
	let nameSuccess = $state(false);

	let avatarInput = $state<HTMLInputElement | null>(null);
	let avatarLoading = $state(false);
	let avatarError = $state('');

	let oldPassword = $state('');
	let newPassword = $state('');
	let newPasswordConfirm = $state('');
	let passwordLoading = $state(false);
	let passwordError = $state('');
	let passwordSuccess = $state(false);
	let showOld = $state(false);
	let showNew = $state(false);

	const avatarUrl = $derived(
		auth.user?.avatar
			? `${pb.baseURL}/api/files/users/${auth.user.id}/${auth.user.avatar}`
			: null
	);

	const inputCls = 'w-full bg-panel border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-subtle';

	$effect(() => {
		if (!name && initialDisplayName) {
			name = initialDisplayName;
		}
	});

	async function saveName() {
		if (!name.trim() || !auth.user) return;
		nameLoading = true;
		nameError = '';
		nameSuccess = false;
		try {
			await pb.collection('users').update(auth.user.id, { name: name.trim() });
			await pb.collection('users').authRefresh();
			nameSuccess = true;
			setTimeout(() => (nameSuccess = false), 2000);
		} catch (e) {
			nameError = e instanceof Error ? e.message : 'Failed to update name.';
		} finally {
			nameLoading = false;
		}
	}

	async function handleAvatarChange(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file || !auth.user) return;
		avatarLoading = true;
		avatarError = '';
		const fd = new FormData();
		fd.append('avatar', file);
		try {
			await pb.collection('users').update(auth.user.id, fd);
			await pb.collection('users').authRefresh();
		} catch (e) {
			avatarError = e instanceof Error ? e.message : 'Failed to upload avatar.';
		} finally {
			avatarLoading = false;
		}
	}

	async function savePassword() {
		passwordError = '';
		if (newPassword !== newPasswordConfirm) {
			passwordError = 'Passwords do not match.';
			return;
		}
		if (newPassword.length < 8) {
			passwordError = 'New password must be at least 8 characters.';
			return;
		}
		if (!auth.user) return;
		passwordLoading = true;
		passwordSuccess = false;
		try {
			await pb.collection('users').update(auth.user.id, {
				oldPassword,
				password: newPassword,
				passwordConfirm: newPasswordConfirm,
			});
			oldPassword = '';
			newPassword = '';
			newPasswordConfirm = '';
			passwordSuccess = true;
			setTimeout(() => (passwordSuccess = false), 3000);
		} catch (e) {
			passwordError = e instanceof Error ? e.message : 'Failed to update password.';
		} finally {
			passwordLoading = false;
		}
	}
</script>

<div class="mt-12 border-t border-border pt-8 space-y-8">
	<h2 class="text-sm font-semibold text-foreground">Edit Profile</h2>

	<div class="flex items-start gap-6">
		<div class="shrink-0 flex flex-col items-center gap-1">
			<button
				onclick={() => avatarInput?.click()}
				disabled={avatarLoading}
				title="Change avatar"
				class="relative w-16 h-16 rounded-full bg-panel border border-border flex items-center justify-center overflow-hidden hover:border-subtle transition-colors cursor-pointer group disabled:opacity-60 disabled:cursor-not-allowed"
			>
				{#if avatarUrl}
					<img src={avatarUrl} alt="Avatar" class="w-full h-full object-cover" />
				{:else}
					<User size={26} class="text-muted" />
				{/if}
				<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
					{#if avatarLoading}
						<RefreshCw size={16} class="text-white animate-spin" />
					{:else}
						<Camera size={16} class="text-white" />
					{/if}
				</div>
			</button>
			{#if avatarError}
				<p class="text-xs text-red-300 text-center max-w-20">{avatarError}</p>
			{/if}
		</div>

		<input bind:this={avatarInput} type="file" accept="image/*" class="hidden" onchange={handleAvatarChange} />

		<div class="flex-1 space-y-1.5">
			<label for="profile-name" class="block text-xs text-muted">Display name</label>
			<div class="flex gap-2">
				<input
					id="profile-name"
					bind:value={name}
					type="text"
					placeholder="Display name"
					class="flex-1 bg-panel border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-subtle"
					onkeydown={(e) => e.key === 'Enter' && saveName()}
				/>
				<button
					onclick={saveName}
					disabled={nameLoading || !name.trim()}
					class="min-w-16 px-3 py-1.5 rounded text-sm border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1
						{nameSuccess ? 'border-green-700/50 bg-green-950/30 text-green-400' : 'border-border bg-panel text-foreground hover:bg-surface'}"
				>
					{#if nameLoading}
						<RefreshCw size={13} class="animate-spin" />
					{:else if nameSuccess}
						<Check size={13} />
					{:else}
						Save
					{/if}
				</button>
			</div>
			{#if nameError}
				<p class="text-xs text-red-300">{nameError}</p>
			{/if}
		</div>
	</div>

	<div class="space-y-3">
		<h3 class="text-xs font-medium text-muted uppercase tracking-wide">Change Password</h3>
		<div class="max-w-xs space-y-2">
			<div class="relative">
				<input
					bind:value={oldPassword}
					type={showOld ? 'text' : 'password'}
					placeholder="Current password"
					class="{inputCls} pr-9"
				/>
				<button onclick={() => (showOld = !showOld)} tabindex="-1" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors cursor-pointer">
					{#if showOld}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
				</button>
			</div>
			<div class="relative">
				<input
					bind:value={newPassword}
					type={showNew ? 'text' : 'password'}
					placeholder="New password"
					class="{inputCls} pr-9"
				/>
				<button onclick={() => (showNew = !showNew)} tabindex="-1" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors cursor-pointer">
					{#if showNew}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
				</button>
			</div>
			<input
				bind:value={newPasswordConfirm}
				type="password"
				placeholder="Confirm new password"
				class={inputCls}
			/>
			{#if passwordError}
				<p class="text-xs text-red-300">{passwordError}</p>
			{/if}
			{#if passwordSuccess}
				<p class="text-xs text-green-400 flex items-center gap-1.5"><Check size={12} /> Password updated.</p>
			{/if}
			<button
				onclick={savePassword}
				disabled={passwordLoading || !oldPassword || !newPassword || !newPasswordConfirm}
				class="flex items-center gap-2 px-3 py-1.5 rounded text-sm border border-border bg-panel text-foreground hover:bg-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{#if passwordLoading}
					<RefreshCw size={13} class="animate-spin" />
					Updating…
				{:else}
					<KeyRound size={14} />
					Update password
				{/if}
			</button>
		</div>
	</div>
</div>
