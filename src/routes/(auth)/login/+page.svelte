<script lang="ts">
	import { LogIn } from '@lucide/svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import AuthField from '#features/auth/AuthField.svelte';
	import AuthForm from '#features/auth/AuthForm.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<SeoHead
	title="Login - Shayders"
	description="Sign in to your Shayders account to create and share GLSL shaders."
	robots="noindex, follow"
/>

<AuthForm title="Welcome back" error={form?.error} submitIcon={LogIn} submitLabel="Sign in">
	<AuthField id="email" label="Email address" type="email" name="email" autocomplete="email" value={form?.email ?? ''} placeholder="you@example.com" />
	<AuthField id="password" label="Password" type="password" name="password" autocomplete="current-password" placeholder="••••••••" />

	{#snippet footer()}
		<p class="mt-6 text-center text-sm text-muted">
			No account yet?
			<a href="/signup" class="font-medium text-accent transition-colors hover:text-accent-light">Create one</a>
		</p>
	{/snippet}
</AuthForm>
