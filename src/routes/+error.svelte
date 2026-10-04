<script lang="ts">
	import { page } from '$app/state';
	import { CircleAlert } from '@lucide/svelte';
	import ErrorPage from '#components/ui/ErrorPage.svelte';
</script>

<ErrorPage icon={CircleAlert} status={page.status} title={String(page.status)} message={page.error?.message ?? 'An unexpected error occurred.'} />
