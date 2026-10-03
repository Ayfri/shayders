<script lang="ts">
	import { Heart } from '@lucide/svelte';
	import { page } from '$app/state';

	const noFooterPages = ['/new', '/shader/'] as const;
</script>

{#if !noFooterPages.some((pagePath) => page.url.pathname.startsWith(pagePath))}
	<footer class="flex items-center justify-center px-6 py-4 bg-surface border-t border-border text-sm text-muted shrink-0">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-1">
				<span>Built with</span>
				<Heart size={16} class="text-red-500 fill-red-500" />
				<span>by</span>
				<a
					href="https://ayfri.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-foreground font-semibold hover:text-white transition-colors"
				>
					Ayfri
				</a>
			</div>
			<div class="w-px h-4 bg-border"></div>
			<a
				href="https://github.com/Ayfri/shayders"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 text-foreground hover:text-white transition-colors"
				title="GitHub Repository"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="16" width="16" class="self-center">
					<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"></path>
				</svg>
				<span>GitHub</span>
			</a>
			<a
				href="https://discord.ayfri.com"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 text-foreground hover:text-white transition-colors"
				title="Discord Server"
			>
				<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" viewBox="0 -28.5 256 256" height="16" width="16" class="self-center">
					<path fill="currentColor" d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"></path>
				</svg>
				<span>Discord</span>
			</a>
		</div>
	</footer>
{/if}
