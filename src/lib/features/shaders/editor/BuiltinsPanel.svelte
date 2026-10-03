<script lang="ts" module>
	import { BUILTIN_FUNCTION_DOC_ENTRIES, BUILTIN_VARIABLE_DOC_ENTRIES } from '#lib/glsl/builtins.js';

	type MarkdownPart = string | { type: 'italic' | 'bold' | 'code'; content: string };

	interface ParsedSignature {
		functionName: string;
		params: { name: string; type: string }[];
		returnType: string;
	}

	function parseMarkdown(text: string): MarkdownPart[] {
		const parts: MarkdownPart[] = [];
		let i = 0;

		while (i < text.length) {
			if (text[i] === '*' && text[i + 1] === '*') {
				const end = text.indexOf('**', i + 2);
				if (end !== -1) {
					parts.push({ type: 'bold', content: text.slice(i + 2, end) });
					i = end + 2;
					continue;
				}
			}
			if (text[i] === '*') {
				const end = text.indexOf('*', i + 1);
				if (end > i + 1) {
					parts.push({ type: 'italic', content: text.slice(i + 1, end) });
					i = end + 1;
					continue;
				}
			}
			if (text[i] === '`') {
				const end = text.indexOf('`', i + 1);
				if (end !== -1) {
					parts.push({ type: 'code', content: text.slice(i + 1, end) });
					i = end + 1;
					continue;
				}
			}

			const specials = [text.indexOf('*', i + 1), text.indexOf('`', i + 1)].filter((index) => index !== -1);
			const next = specials.length > 0 ? Math.min(...specials) : text.length;
			parts.push(text.slice(i, next));
			i = next;
		}

		return parts;
	}

	function parseSignature(signature: string): ParsedSignature | null {
		const match = signature.match(/^(\S+)\s+(\w+)\s*\((.*)\)$/);
		if (!match) return null;

		const params = match[3].split(',').flatMap((part) => {
			const tokens = part.trim().split(/\s+/);
			return tokens.length >= 2 ? [{ name: tokens.at(-1)!, type: tokens.slice(0, -1).join(' ') }] : [];
		});

		return { functionName: match[2], params, returnType: match[1] };
	}

	function getTypeColor(type: string): string {
		if (/^[d]?mat[234](x[234])?$/.test(type)) return 'text-amber-400';
		if (/^(float|int|bool|uint|double)$/.test(type)) return 'text-emerald-400';
		if (/^(image|sampler)/.test(type)) return 'text-rose-400';
		return 'text-cyan-400';
	}

	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

	/** Fragment-only built-in variables are shown in the panel. */
	const glBuiltins = BUILTIN_VARIABLE_DOC_ENTRIES
		.map(([name, doc]) => ({ markdownParts: parseMarkdown(doc.description), name, type: doc.signature.match(/^(\S+)/)?.[1] ?? 'unknown' }))
		.sort(byName);

	const glslFunctions = BUILTIN_FUNCTION_DOC_ENTRIES
		.map(([name, doc]) => {
			const signature = doc.signature.split('\n')[0];
			return {
				markdownParts: parseMarkdown(doc.description),
				name,
				parsedSignature: parseSignature(signature),
				returnType: signature.match(/^(\S+)\s+(\w+)/)?.[1] ?? '',
				signature,
			};
		})
		.sort(byName);

	const groupedFunctions = [...Map.groupBy(glslFunctions, (fn) => fn.returnType)].sort(([a], [b]) => a.localeCompare(b));
</script>

<script lang="ts">
	import { ChevronDown, ChevronRight, Variable } from '@lucide/svelte';
	import type { UniformDescriptor } from '#features/shaders/editor/uniforms.js';

	interface Props {
		onToggle?: (name: string, type: string) => void;
		open?: boolean;
		presentNames?: Set<string>;
		uniforms?: UniformDescriptor[];
		values?: Record<string, string>;
	}

	let { onToggle, open = $bindable(false), presentNames = new Set(), uniforms = [], values = {} }: Props = $props();

	const total = $derived(uniforms.length + glBuiltins.length + glslFunctions.length);
</script>

{#snippet markdown(parts: MarkdownPart[])}
	{#each parts as part}
		{#if typeof part === 'string'}
			{part}
		{:else if part.type === 'italic'}
			<em class="not-italic text-cyan-300">{part.content}</em>
		{:else if part.type === 'bold'}
			<strong class="font-semibold text-cyan-200">{part.content}</strong>
		{:else}
			<code class="bg-background px-0.5 rounded text-amber-300">{part.content}</code>
		{/if}
	{/each}
{/snippet}

<div class="border-t border-border flex flex-col min-h-0 shrink-0">
	<button
		onclick={() => (open = !open)}
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
			{#if uniforms.length > 0}
				<div class="px-4 pt-1 pb-0.5 text-10 uppercase tracking-widest text-subtle font-semibold">
					Uniforms
				</div>
				{#each uniforms as u (u.name)}
					{@const present = presentNames.has(u.name)}
					<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
						<button
							onclick={() => onToggle?.(u.name, u.type)}
							title={present ? `Remove uniform ${u.name}` : `Add uniform ${u.name}`}
							class="relative flex items-center justify-center w-3.5 shrink-0 self-center cursor-pointer"
						>
							<span class="block group-hover:hidden w-1.5 h-1.5 rounded-full {present ? 'bg-green-400/70' : 'bg-border'}"></span>
							<span class="hidden group-hover:block text-11 font-bold leading-none {present ? 'text-red-400' : 'text-cyan-400'}">{present ? '−' : '+'}</span>
						</button>
						<span class="{present ? getTypeColor(u.type) : 'text-subtle'} font-mono shrink-0 text-11">{u.type}</span>
						<span class="{present ? 'text-foreground' : 'text-muted'} font-mono shrink-0 font-semibold text-11">{u.name}</span>
						{#if u.description}
							<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-11">
								{u.description}
							</span>
						{/if}
						{#if values[u.name] !== undefined}
							<span class="ml-auto font-mono text-green-400 shrink-0 tabular-nums text-11">{values[u.name]}</span>
						{/if}
					</div>
				{/each}
			{/if}

			<div class="px-4 pt-2 pb-0.5 text-10 uppercase tracking-widest text-subtle font-semibold">
				Built-in Variables
			</div>
			{#each glBuiltins as v (v.name)}
				<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
					<span class="{getTypeColor(v.type)} font-mono shrink-0 text-11 whitespace-nowrap">{v.type}</span>
					<span class="text-foreground font-mono shrink-0 font-semibold text-11 whitespace-nowrap">{v.name}</span>
					<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-11">
						{@render markdown(v.markdownParts)}
					</span>
				</div>
			{/each}

			<div class="px-4 pt-2 pb-0.5 text-10 uppercase tracking-widest text-subtle font-semibold">
				Functions
			</div>
			{#each groupedFunctions as [returnType, functions] (returnType)}
				<div class="px-4 pt-3 pb-0.5 text-10 uppercase tracking-widest text-cyan-400 font-semibold">
					{returnType}
				</div>
				{#each functions as fn (fn.name)}
					<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
						<span class="font-mono shrink-0 text-11 whitespace-nowrap">
							{#if fn.parsedSignature}
								<span class={getTypeColor(fn.parsedSignature.returnType)}>{fn.parsedSignature.returnType}</span><span class="text-foreground">{' '}{fn.parsedSignature.functionName}(</span>{#each fn.parsedSignature.params as param, i}{#if i > 0}<span class="text-foreground">,</span>{' '}{/if}<span class={getTypeColor(param.type)}>{param.type}</span><span class="text-white">{' '}{param.name}</span>{/each}<span class="text-foreground">)</span>
							{:else}
								<span class="text-blue-300">{fn.signature}</span>
							{/if}
						</span>
						<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-11">
							{@render markdown(fn.markdownParts)}
						</span>
					</div>
				{/each}
			{/each}
		</div>
	{/if}
</div>
