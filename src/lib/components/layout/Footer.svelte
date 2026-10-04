<script lang="ts" module>
	interface FooterLink {
		external?: boolean;
		href: string;
		label: string;
	}

	const COLUMNS: { links: FooterLink[]; title: string }[] = [
		{
			links: [
				{ href: '/new', label: 'New shader' },
				{ href: '/#features', label: 'Features' },
				{ href: '/#gallery', label: 'Gallery' },
				{ href: '/search', label: 'Search' },
			],
			title: 'Product',
		},
		{
			links: [
				{ external: true, href: 'https://github.com/Ayfri/shayders', label: 'GitHub' },
				{ external: true, href: 'https://github.com/Ayfri/shayders/issues', label: 'Report a bug' },
				{ external: true, href: 'https://discord.ayfri.com', label: 'Discord' },
				{ href: '/llms.txt', label: 'llms.txt' },
			],
			title: 'Community',
		},
	];
</script>

<script lang="ts">
	import { Heart } from '@lucide/svelte';
	import logo from '#lib/assets/logo.png';
</script>

<footer class="border-t border-border bg-surface text-sm text-muted">
	<div class="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 sm:grid-cols-[1fr_auto_auto] sm:gap-x-16 lg:px-10">
		<div class="col-span-2 flex flex-col gap-4 sm:col-span-1">
			<a href="/" class="flex w-fit items-center gap-2 text-base font-semibold text-foreground transition-colors hover:text-white">
				<img src={logo} alt="" class="size-7" />
				Shayders
			</a>
			<p class="max-w-xs leading-6">Write, preview and share GLSL fragment shaders right in your browser.</p>
			<div class="flex items-center gap-2">
				<a
					href="https://github.com/Ayfri/shayders"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="GitHub repository"
					class="rounded-lg border border-border p-2 text-muted transition-colors hover:border-subtle hover:text-foreground"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="16" width="16">
						<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"></path>
					</svg>
				</a>
				<a
					href="https://discord.ayfri.com"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Discord server"
					class="rounded-lg border border-border p-2 text-muted transition-colors hover:border-subtle hover:text-foreground"
				>
					<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" viewBox="0 -28.5 256 256" height="16" width="16">
						<path fill="currentColor" d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"></path>
					</svg>
				</a>
			</div>
		</div>

		{#each COLUMNS as column (column.title)}
			<nav aria-label={column.title} class="flex flex-col gap-3">
				<p class="font-mono text-11 uppercase tracking-[0.2em] text-subtle">{column.title}</p>
				{#each column.links as link (link.href)}
					<a
						href={link.href}
						target={link.external ? '_blank' : undefined}
						rel={link.external ? 'noopener noreferrer' : undefined}
						class="w-fit transition-colors hover:text-cyan-300"
					>
						{link.label}
					</a>
				{/each}
			</nav>
		{/each}
	</div>

	<div class="border-t border-border">
		<div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-4 text-xs sm:flex-row sm:justify-between lg:px-10">
			<p class="flex items-center gap-1">
				Built with <Heart size={13} class="fill-red-500 text-red-500" /> by
				<a href="https://ayfri.com" target="_blank" rel="noopener noreferrer" class="font-semibold text-foreground transition-colors hover:text-white">Ayfri</a>
			</p>
			<a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-foreground">
				Open source under GPL-3.0
			</a>
		</div>
	</div>
</footer>
