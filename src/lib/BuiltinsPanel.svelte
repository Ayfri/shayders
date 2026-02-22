<script lang="ts">
	import { BUILTIN_DOCS } from '$lib/glsl/builtins';
	import { ChevronDown, ChevronRight, Variable } from '@lucide/svelte';

	export interface UniformEntry {
		name: string;
		type: string;
		description?: string;
		value?: string;
	}

	interface Props {
		uniforms?: UniformEntry[];
		open?: boolean;
	}

	let { uniforms = [], open = $bindable(false) }: Props = $props();

	const sortedUniforms = $derived(
		[...uniforms].sort((a, b) => a.name.localeCompare(b.name))
	);

	// Parse simple markdown: *italic*, **bold**, `code`
	function parseMarkdown(text: string) {
		const parts: (string | { type: 'italic' | 'bold' | 'code'; content: string })[] = [];
		let remainder = text;
		let i = 0;

		while (i < remainder.length) {
			// Check for **bold**
			if (remainder[i] === '*' && remainder[i + 1] === '*') {
				const endIdx = remainder.indexOf('**', i + 2);
				if (endIdx !== -1) {
					const content = remainder.slice(i + 2, endIdx);
					parts.push({ type: 'bold', content });
					i = endIdx + 2;
					continue;
				}
			}
			// Check for *italic*
			if (remainder[i] === '*') {
				const endIdx = remainder.indexOf('*', i + 1);
				if (endIdx !== -1 && endIdx > i + 1) {
					const content = remainder.slice(i + 1, endIdx);
					parts.push({ type: 'italic', content });
					i = endIdx + 1;
					continue;
				}
			}
			// Check for `code`
			if (remainder[i] === '`') {
				const endIdx = remainder.indexOf('`', i + 1);
				if (endIdx !== -1) {
					const content = remainder.slice(i + 1, endIdx);
					parts.push({ type: 'code', content });
					i = endIdx + 1;
					continue;
				}
			}
			// Regular text
			const nextSpecial = Math.min(...[
				remainder.indexOf('*', i),
				remainder.indexOf('`', i),
			].filter((idx) => idx !== -1));

			if (nextSpecial === -1) {
				parts.push(remainder.slice(i));
				break;
			} else {
				parts.push(remainder.slice(i, nextSpecial));
				i = nextSpecial;
			}
		}

		return parts;
	}

	// Extract gl_* built-in variables from builtins doc
	const glBuiltins = Object.entries(BUILTIN_DOCS)
		.filter(([k]) => k.startsWith('gl_'))
		.map(([name, doc]) => {
			// Signature is like "vec4 gl_FragCoord" or "float gl_PointSize"
			const match = doc.signature.match(/^(\S+)/);
			const type = match ? match[1] : 'unknown';
			return { name, type, description: doc.description };
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const total = $derived(uniforms.length + glBuiltins.length);

	function toggle() {
		open = !open;
	}
</script>

<div class="border-t border-border flex flex-col min-h-0 shrink-0">
	<!-- Header / toggle -->
	<button
		onclick={toggle}
		class="flex w-full items-center gap-2 px-4 py-2 text-xs text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
	>
		{#if open}
			<ChevronDown size={12} class="shrink-0" />
		{:else}
			<ChevronRight size={12} class="shrink-0" />
		{/if}
		<Variable size={12} class="text-cyan-400 shrink-0" />
		<span class="font-medium tracking-wider">Built-ins</span>
		<span class="ml-auto text-subtle font-mono">{total}</span>
	</button>

	{#if open}
		<div class="overflow-y-auto max-h-100 mb-2 text-xs">
			<!-- Uniforms -->
			{#if sortedUniforms.length > 0}
				<div class="px-4 pt-1 pb-0.5 text-[10px] uppercase tracking-widest text-subtle font-semibold">
					Uniforms
				</div>
				{#each sortedUniforms as u (u.name)}
					<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
						<span class="text-cyan-400 font-mono shrink-0 text-[11px]">{u.type}</span>
						<span class="text-foreground font-mono shrink-0 font-semibold text-[11px]">{u.name}</span>
						{#if u.description}
							<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-[11px]">
								{u.description}
							</span>
						{/if}
						{#if u.value !== undefined}
							<span class="ml-auto font-mono text-green-400 shrink-0 tabular-nums text-[11px]">{u.value}</span>
						{/if}
					</div>
				{/each}
			{/if}

			<!-- GLSL built-in variables -->
			<div class="px-4 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-subtle font-semibold">
				Built-in Variables
			</div>
			{#each glBuiltins as v (v.name)}
				<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
					<span class="text-purple-400 font-mono shrink-0 text-[11px] whitespace-nowrap">{v.type}</span>
					<span class="text-foreground font-mono shrink-0 font-semibold text-[11px] whitespace-nowrap">{v.name}</span>
					<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-[11px]">
						{#each parseMarkdown(v.description) as part}
							{#if typeof part === 'string'}
								{part}
							{:else if part.type === 'italic'}
								<em class="not-italic text-cyan-300">{part.content}</em>
							{:else if part.type === 'bold'}
								<strong class="font-semibold text-cyan-200">{part.content}</strong>
							{:else if part.type === 'code'}
								<code class="bg-background px-0.5 rounded text-amber-300">{part.content}</code>
							{/if}
						{/each}
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
