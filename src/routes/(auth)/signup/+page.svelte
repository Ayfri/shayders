<script lang="ts">
	import { UserPlus } from '@lucide/svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import AuthField from '#features/auth/AuthField.svelte';
	import AuthForm from '#features/auth/AuthForm.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<SeoHead
	title="Sign Up - Shayders"
	description="Create your Shayders account to start creating and sharing GLSL shaders."
	robots="noindex, follow"
/>

<AuthForm title="Join us" error={form?.error} submitIcon={UserPlus} submitLabel="Create account">
	<AuthField id="name" label="Username" type="text" name="name" autocomplete="username" value={form?.name ?? ''} placeholder="your_name" />
	<AuthField id="email" label="Email address" type="email" name="email" autocomplete="email" value={form?.email ?? ''} placeholder="you@example.com" />
	<AuthField id="password" label="Password" type="password" name="password" autocomplete="new-password" placeholder="••••••••" />
	<AuthField id="password-confirm" label="Confirm password" type="password" name="passwordConfirm" autocomplete="new-password" placeholder="••••••••" />

	{#snippet footer()}
		<p class="mt-6 text-center text-sm text-muted">
			Already have an account?
			<a href="/login" class="font-medium text-accent transition-colors hover:text-accent-light">Sign in</a>
		</p>
	{/snippet}
</AuthForm>
