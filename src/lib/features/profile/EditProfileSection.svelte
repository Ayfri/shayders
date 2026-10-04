<script lang="ts">
	import { Camera, Check, Eye, EyeOff, KeyRound, RefreshCw } from '@lucide/svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import { auth } from '#features/auth/auth-client.svelte.js';
	import { getAvatarUrl, pb } from '#lib/pocketbase.js';

	interface Props {
		initialName?: string;
	}

	let { initialName = '' }: Props = $props();

	/** Follows the saved name, typing overrides it until the next save refreshes `auth.user`. */
	let name = $derived(auth.user?.name ?? initialName);
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

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim() || !auth.user) return;
		nameLoading = true;
		nameError = '';
		nameSuccess = false;
		try {
			await pb.collection('users').update(auth.user.id, { name: name.trim() });
			await pb.collection('users').authRefresh();
			nameSuccess = true;
			window.setTimeout(() => (nameSuccess = false), 2000);
		} catch (err) {
			nameError = err instanceof Error ? err.message : 'Failed to update name.';
		} finally {
			nameLoading = false;
		}
	}

	async function handleAvatarChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file || !auth.user) return;
		avatarLoading = true;
		avatarError = '';
		const formData = new FormData();
		formData.append('avatar', file);
		try {
			await pb.collection('users').update(auth.user.id, formData);
			await pb.collection('users').authRefresh();
		} catch (err) {
			avatarError = err instanceof Error ? err.message : 'Failed to upload avatar.';
		} finally {
			avatarLoading = false;
		}
	}

	async function savePassword(event: SubmitEvent) {
		event.preventDefault();
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
			await pb.collection('users').update(auth.user.id, { oldPassword, password: newPassword, passwordConfirm: newPasswordConfirm });
			oldPassword = '';
			newPassword = '';
			newPasswordConfirm = '';
			passwordSuccess = true;
			window.setTimeout(() => (passwordSuccess = false), 3000);
		} catch (err) {
			passwordError = err instanceof Error ? err.message : 'Failed to update password.';
		} finally {
			passwordLoading = false;
		}
	}
</script>

{#snippet revealToggle(shown: boolean, toggle: () => void)}
	<button
		type="button"
		onclick={toggle}
		tabindex="-1"
		aria-label={shown ? 'Hide password' : 'Show password'}
		class="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle transition-colors hover:text-muted"
	>
		{#if shown}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
	</button>
{/snippet}

<div class="mt-12 space-y-8 border-t border-border pt-8">
	<h2 class="text-sm font-semibold text-foreground">Edit profile</h2>

	<div class="flex items-start gap-6">
		<div class="flex shrink-0 flex-col items-center gap-1">
			<button
				onclick={() => avatarInput?.click()}
				disabled={avatarLoading}
				title="Change avatar"
				aria-label="Change avatar"
				class="group relative overflow-hidden rounded-full disabled:opacity-60"
			>
				<UserAvatar src={auth.user && getAvatarUrl(auth.user)} alt="Avatar" class="size-16 transition-colors group-hover:border-subtle" />
				<div class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
					{#if avatarLoading}
						<RefreshCw size={16} class="animate-spin text-white" />
					{:else}
						<Camera size={16} class="text-white" />
					{/if}
				</div>
			</button>
			{#if avatarError}
				<p class="max-w-20 text-center text-xs text-red-300">{avatarError}</p>
			{/if}
		</div>

		<input bind:this={avatarInput} type="file" accept="image/*" class="sr-only" onchange={handleAvatarChange} />

		<form onsubmit={saveName} class="flex-1 space-y-1.5">
			<label for="profile-name" class="block text-xs text-muted">Display name</label>
			<div class="flex gap-2">
				<input id="profile-name" bind:value={name} type="text" placeholder="Display name" class="field flex-1 px-3 py-1.5" />
				<button
					type="submit"
					disabled={nameLoading || !name.trim()}
					class="btn-secondary min-w-16 px-3 py-1.5 text-sm"
				>
					{#if nameLoading}
						<RefreshCw size={13} class="animate-spin" />
					{:else if nameSuccess}
						<Check size={13} class="text-green-400" />
					{:else}
						Save
					{/if}
				</button>
			</div>
			{#if nameError}
				<p class="text-xs text-red-300">{nameError}</p>
			{/if}
		</form>
	</div>

	<form onsubmit={savePassword} class="space-y-3">
		<h3 class="text-xs font-medium uppercase tracking-wide text-muted">Change password</h3>
		<div class="max-w-xs space-y-2">
			<input type="text" name="username" autocomplete="username" value={auth.user?.email ?? ''} hidden />
			<div class="relative">
				<input bind:value={oldPassword} type={showOld ? 'text' : 'password'} autocomplete="current-password" placeholder="Current password" aria-label="Current password" class="field px-3 py-1.5 pr-9" />
				{@render revealToggle(showOld, () => (showOld = !showOld))}
			</div>
			<div class="relative">
				<input bind:value={newPassword} type={showNew ? 'text' : 'password'} autocomplete="new-password" placeholder="New password" aria-label="New password" class="field px-3 py-1.5 pr-9" />
				{@render revealToggle(showNew, () => (showNew = !showNew))}
			</div>
			<input bind:value={newPasswordConfirm} type="password" autocomplete="new-password" placeholder="Confirm new password" aria-label="Confirm new password" class="field px-3 py-1.5" />
			{#if passwordError}
				<p class="text-xs text-red-300">{passwordError}</p>
			{/if}
			{#if passwordSuccess}
				<p class="flex items-center gap-1.5 text-xs text-green-400"><Check size={12} /> Password updated.</p>
			{/if}
			<button type="submit" disabled={passwordLoading || !oldPassword || !newPassword || !newPasswordConfirm} class="btn-secondary px-3 py-1.5 text-sm">
				{#if passwordLoading}
					<RefreshCw size={13} class="animate-spin" />
					Updating…
				{:else}
					<KeyRound size={14} />
					Update password
				{/if}
			</button>
		</div>
	</form>
</div>
