<script lang="ts">
	import { UserX } from '@lucide/svelte';
	import ErrorPage from '#components/ui/ErrorPage.svelte';
</script>

<ErrorPage icon={UserX} status={404} title="User Not Found" message="This user doesn't exist or may have been removed." />
