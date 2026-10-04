<script lang="ts">
	import { FileX } from '@lucide/svelte';
	import ErrorPage from '#components/ui/ErrorPage.svelte';
</script>

<ErrorPage icon={FileX} status={404} title="Shader Not Found" message="This shader doesn't exist or may have been deleted." linkLabel="Browse shaders" />
