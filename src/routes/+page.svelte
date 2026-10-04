<script lang="ts" module>
	import { BookOpen, Camera, GitFork, HardDrive, Import, type LucideIcon, Sparkles, TvMinimal, Wrench } from '@lucide/svelte';

	interface Feature {
		description: string;
		icon: LucideIcon;
		title: string;
		wide?: boolean;
	}

	const FEATURES: Feature[] = [
		{
			description: 'Four slots for images, videos, your webcam or another buffer, each with its own filter, wrap and flip settings.',
			icon: TvMinimal,
			title: 'Texture channels',
		},
		{
			description: 'Completion for builtins, locals and Common symbols, hover docs that show the matched overload, semantic highlighting.',
			icon: Sparkles,
			title: 'Real GLSL tooling',
		},
		{
			description: 'Catches GLSL ES 1.00 pitfalls and unused or write-only symbols, fixes them with Alt+Enter. Compile errors land in the right buffer.',
			icon: Wrench,
			title: 'Lint and quick fixes',
		},
		{
			description: 'Every function, variable and uniform documented and searchable. Add uniforms in one click and read their live values.',
			icon: BookOpen,
			title: 'Built-ins reference',
		},
		{
			description: 'Paste a mainImage shader and convert it to plain WebGL in one click.',
			icon: Import,
			title: 'Shadertoy import',
		},
		{
			description: 'Save WebP screenshots, record 60 fps WebM clips up to 5 minutes, go fullscreen with F.',
			icon: Camera,
			title: 'Screenshots and video',
		},
		{
			description: 'Publish as public, unlisted or private. Fork any shader you like, browse creator profiles and search the whole gallery.',
			icon: GitFork,
			title: 'Share and fork',
			wide: true,
		},
		{
			description: 'No account needed to start, drafts stay in your browser. Fonts, minimap, wrapping and hints are all in the editor settings.',
			icon: HardDrive,
			title: 'Jump right in',
			wide: true,
		},
	];
</script>

<script lang="ts">
	import { ArrowDown, ArrowRight, CodeXml, Layers, Play, Zap } from '@lucide/svelte';
	import HeroShader from '#features/home/HeroShader.svelte';
	import ShaderCard from '#features/shaders/preview/ShaderCard.svelte';
	import ShaderSortNav from '#features/shaders/preview/ShaderSortNav.svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import EmptyState from '#components/ui/EmptyState.svelte';
	import { plural } from '#lib/format.js';
	import { buildSiteUrl, getShaderPath, getUserProfilePath, SITE_URL } from '#lib/site.js';
	import { sortShaders } from '#features/shaders/model/shader-list.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const shaders = $derived(sortShaders(data.shaders, data.selectedSort));
	const visibleAuthors = $derived(new Set(shaders.map((shader) => shader.authorId)).size);
</script>

<SeoHead
	title="Shayders - Online GLSL Shader Editor and Gallery"
	description="Write WebGL fragment shaders in GLSL with a live preview, multipass buffers and texture channels, then share them and explore the community gallery."
	jsonLd={{
		'@type': 'CollectionPage',
		about: 'GLSL fragment shaders',
		isPartOf: { '@id': `${SITE_URL}/#website` },
		mainEntity: {
			'@type': 'ItemList',
			itemListElement: shaders.map((shader, index) => ({
				'@type': 'ListItem',
				name: shader.name,
				position: index + 1,
				url: buildSiteUrl(getShaderPath(shader.id)),
			})),
			numberOfItems: data.totalShaders,
		},
		name: 'Explore Shaders',
		url: `${SITE_URL}/`,
	}}
/>

{#snippet primaryCta(label: string)}
	<a
		href="/new"
		class="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-background shadow-[0_0_32px_-6px_var(--color-accent)] transition-all hover:bg-accent-light hover:shadow-[0_0_44px_-4px_var(--color-accent-light)]"
	>
		<Play size={15} class="fill-current" />
		{label}
		<ArrowRight size={15} class="transition-transform group-hover:translate-x-0.5" />
	</a>
{/snippet}

<div class="min-h-full bg-background text-foreground">
	<section class="relative isolate overflow-hidden border-b border-border">
		<div class="absolute inset-0 -z-10">
			<HeroShader />
		</div>
		<div class="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-background/10 via-background/35 to-background"></div>

		<div class="mx-auto flex min-h-[min(78svh,680px)] max-w-6xl flex-col justify-center px-6 py-20 lg:px-10">
			<h1 class="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
				Write GLSL.
				<span class="block bg-linear-to-r from-accent-light via-sky-400 to-fuchsia-400 bg-clip-text text-transparent">Watch it come alive.</span>
			</h1>

			<p class="mt-6 max-w-xl text-base leading-7 text-foreground/80 sm:text-lg">
				A shader editor in your browser with a live WebGL preview, multipass buffers, texture channels and real GLSL tooling. The background is a shader too, move your mouse over it.
			</p>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				{@render primaryCta('Start coding')}
				<a
					href="#gallery"
					class="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-5 py-2.5 text-sm text-foreground backdrop-blur transition-colors hover:border-subtle hover:bg-panel"
				>
					Explore the gallery
					<ArrowDown size={15} />
				</a>
			</div>

			<p class="mt-8 text-sm text-muted">
				<span class="font-semibold text-foreground">{plural(data.totalShaders, 'public shader')}</span> and counting, no account needed to start.
			</p>
		</div>
	</section>

	<section id="features" class="mx-auto max-w-6xl scroll-mt-4 px-6 py-16 sm:py-24 lg:px-10">
		<div class="mb-10 max-w-2xl">
			<h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">What's in the editor</h2>
			<p class="mt-3 text-muted">From a quick gradient to a multipass simulation.</p>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<article class="feature-card flex flex-col gap-5 sm:col-span-2 lg:row-span-2">
				<div class="flex items-center gap-3">
					<span class="feature-icon"><Zap size={18} /></span>
					<h3 class="text-lg font-semibold text-white">Live as you type</h3>
				</div>
				<p class="text-sm leading-6 text-muted">
					No Run button needed. Number and color edits hot-swap on the keystroke, structural changes recompile after a short pause.
					Drag the inline color picker and the canvas follows in real time.
				</p>
				<div class="mt-auto overflow-hidden rounded-lg border border-border bg-background font-mono text-xs leading-6 shadow-2xl">
					<div class="flex items-center gap-1.5 border-b border-border bg-panel px-3 py-2">
						<span class="size-2.5 rounded-full bg-red-400/70"></span>
						<span class="size-2.5 rounded-full bg-yellow-400/70"></span>
						<span class="size-2.5 rounded-full bg-green-400/70"></span>
						<span class="ml-3 text-subtle">Image</span>
						<span class="ml-auto text-green-400">● 0.42ms</span>
					</div>
					<!-- Token colors mirror src/lib/themes/material-darker.ts, hints and swatches mimic Monaco's inlay hints and color decorators. -->
					<pre class="code m-0 overflow-x-auto bg-surface px-4 py-3"><span class="ln">1</span><span class="ty">vec2</span> uv <span class="op">=</span> <span class="pre">gl_FragCoord</span>.<span class="prop">xy</span> <span class="op">/</span> <span class="uni">uResolution</span><span class="op">;</span>
<span class="ln">2</span><span class="ty">vec3</span> dark <span class="op">=</span> <span class="swatch bg-[rgb(5,8,15)]"></span><span class="ty">vec3</span><span class="op">(</span><span class="num">0.02</span><span class="op">,</span> <span class="num">0.03</span><span class="op">,</span> <span class="num">0.06</span><span class="op">);</span>
<span class="ln">3</span><span class="ty">float</span> f <span class="op">=</span> <span class="fn">fbm</span><span class="op">(</span><span class="hint">p:</span>uv <span class="op">*</span> <span class="num">1.6</span> <span class="op">+</span> <span class="uni">uTime</span><span class="op">);</span>
<span class="ln">4</span><span class="ty">vec3</span> col <span class="op">=</span> <span class="pre">mix</span><span class="op">(</span><span class="hint">x:</span>dark<span class="op">,</span> <span class="hint">y:</span><span class="swatch bg-[rgb(0,140,179)]"></span><span class="ty">vec3</span><span class="op">(</span><span class="num">0.0</span><span class="op">,</span> <span class="num">0.55</span><span class="op">,</span> <span class="num">0.7</span><span class="op">),</span> <span class="hint">a:</span>f<span class="op">);</span>
<span class="ln">5</span><span class="pre">gl_FragColor</span> <span class="op">=</span> <span class="ty">vec4</span><span class="op">(</span>col<span class="op">,</span> <span class="num">1.0</span><span class="op">);</span></pre>
				</div>
			</article>

			<article class="feature-card flex flex-col gap-4 sm:col-span-2">
				<div class="flex items-center gap-3">
					<span class="feature-icon"><Layers size={18} /></span>
					<h3 class="text-lg font-semibold text-white">Multipass buffers</h3>
				</div>
				<p class="text-sm leading-6 text-muted">
					Chain up to 8 offscreen buffers, share helpers through a Common tab, and feed a buffer back into a channel for trails, blurs and simulations.
				</p>
				<div class="mt-auto flex flex-wrap items-center gap-2 font-mono text-11">
					<span class="rounded border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-300">Common</span>
					<span class="text-subtle">+</span>
					<span class="rounded border border-border bg-panel px-2 py-1 text-foreground">Buffer A</span>
					<ArrowRight size={12} class="text-subtle" />
					<span class="rounded border border-border bg-panel px-2 py-1 text-foreground">Buffer B</span>
					<ArrowRight size={12} class="text-subtle" />
					<span class="rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent">Image</span>
				</div>
			</article>

			{#each FEATURES as feature (feature.title)}
				<article class={['feature-card flex flex-col gap-3', feature.wide && 'lg:col-span-2']}>
					<span class="feature-icon"><feature.icon size={18} /></span>
					<h3 class="font-semibold text-white">{feature.title}</h3>
					<p class="text-sm leading-6 text-muted">{feature.description}</p>
				</article>
			{/each}
		</div>
	</section>

	<section id="gallery" class="scroll-mt-4 border-t border-border bg-surface/40">
		<div class="mx-auto max-w-6xl px-6 py-16 lg:px-10">
			<div class="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Explore shaders</h2>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-muted">
						Hover a card to play it, open it to read the code and tweak it live. {plural(data.totalShaders, 'public shader')},
						{plural(visibleAuthors, 'creator')} on this page.
					</p>
				</div>

				<ShaderSortNav label="Sort public shaders" selected={data.selectedSort} hash="gallery" />
			</div>

			{#if shaders.length === 0}
				<EmptyState icon={CodeXml} title="No public shaders yet.">Publish the first shader and start the gallery.</EmptyState>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each shaders as shader (shader.id)}
						<ShaderCard {shader} author={{ href: getUserProfilePath(shader.authorId), name: shader.authorName }} />
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section class="relative overflow-hidden border-t border-border">
		<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,--alpha(var(--color-accent)/12%),transparent_65%)]"></div>
		<div class="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center lg:px-10">
			<h2 class="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Got an idea?</h2>
			<p class="max-w-xl text-muted">Start from a working gradient, or paste a Shadertoy shader you already have.</p>
			{@render primaryCta('Open the editor')}
		</div>
	</section>
</div>

<style>
	.code { color: var(--color-foreground); }
	.code .ln { display: inline-block; width: 1.5rem; color: #424242; }
	.code .ty { color: #ffcb6b; }
	.code .fn { color: #82aaff; }
	.code .pre { color: #82aaff; font-style: italic; }
	.code .uni { color: #ff7b7b; }
	.code .num { color: #f78c6c; }
	.code .op { color: #89ddff; }
	.code .prop { color: #b2ccd6; }

	.code .hint {
		margin-right: 0.25em;
		border-radius: 3px;
		background: rgb(97 97 97 / 0.2);
		padding: 0 0.25em;
		font-size: 0.9em;
		color: #969696;
	}

	.code .swatch {
		display: inline-block;
		width: 0.8em;
		height: 0.8em;
		margin: 0 0.3em 0 0.1em;
		border: 1px solid #eee;
		vertical-align: -0.05em;
	}

	.feature-card {
		position: relative;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid var(--color-border);
		background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--color-accent) 6%, transparent), transparent 60%), var(--color-surface);
		padding: 1.25rem;
		transition: border-color 0.3s, transform 0.3s;
	}

	.feature-card:hover {
		border-color: color-mix(in oklab, var(--color-accent) 35%, transparent);
		transform: translateY(-2px);
	}

	.feature-icon {
		display: inline-flex;
		width: fit-content;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--color-accent) 30%, transparent);
		background: color-mix(in oklab, var(--color-accent) 10%, transparent);
		padding: 0.5rem;
		color: var(--color-accent);
	}
</style>
