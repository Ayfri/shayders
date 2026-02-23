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
		presentNames?: Set<string>;
		onToggle?: (name: string, type: string) => void;
		open?: boolean;
	}

	let { uniforms = [], presentNames = new Set(), onToggle, open = $bindable(false) }: Props = $props();

	const sortedUniforms = $derived(
		[...uniforms].sort((a, b) => a.name.localeCompare(b.name))
	);

	function parseMarkdown(text: string) {
		const parts: (string | { type: 'italic' | 'bold' | 'code'; content: string })[] = [];
		let remainder = text;
		let i = 0;

		while (i < remainder.length) {
			if (remainder[i] === '*' && remainder[i + 1] === '*') {
				const endIdx = remainder.indexOf('**', i + 2);
				if (endIdx !== -1) {
					const content = remainder.slice(i + 2, endIdx);
					parts.push({ type: 'bold', content });
					i = endIdx + 2;
					continue;
				}
			}
			if (remainder[i] === '*') {
				const endIdx = remainder.indexOf('*', i + 1);
				if (endIdx !== -1 && endIdx > i + 1) {
					const content = remainder.slice(i + 1, endIdx);
					parts.push({ type: 'italic', content });
					i = endIdx + 1;
					continue;
				}
			}
			if (remainder[i] === '`') {
				const endIdx = remainder.indexOf('`', i + 1);
				if (endIdx !== -1) {
					const content = remainder.slice(i + 1, endIdx);
					parts.push({ type: 'code', content });
					i = endIdx + 1;
					continue;
				}
			}
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

	interface ParsedParam {
		type: string;
		name: string;
	}

	interface ParsedSignature {
		returnType: string;
		functionName: string;
		params: ParsedParam[];
	}

	function parseSignature(signature: string): ParsedSignature | null {
		const match = signature.match(/^(\S+)\s+(\w+)\s*\((.*)\)$/);
		if (!match) return null;

		const returnType = match[1];
		const functionName = match[2];
		const paramsString = match[3];

		const params: ParsedParam[] = [];
		if (paramsString.trim()) {
			const paramParts = paramsString.split(',');
			for (const part of paramParts) {
				const trimmed = part.trim();
				if (!trimmed) continue;
				const tokens = trimmed.split(/\s+/);
				if (tokens.length >= 2) {
					const name = tokens[tokens.length - 1];
					const type = tokens.slice(0, -1).join(' ');
					params.push({ type, name });
				}
			}
		}

		return { returnType, functionName, params };
	}

	function getTypeColor(type: string): string {
		if (type.match(/^[ud]?vec[234]$/) || type.match(/^[iu]?vec$/)) return 'text-cyan-400';
		if (type.match(/^[d]?mat[234](x[234])?$/)) return 'text-amber-400';
		if (type.match(/^(float|int|bool|uint|double)$/)) return 'text-emerald-400';
		if (type.match(/^image/) || type.match(/^sampler/)) return 'text-rose-400';
		return 'text-cyan-400';
	}

	// Extract gl_* built-in variables from builtins doc
	const glBuiltins = Object.entries(BUILTIN_DOCS)
		.filter(([k]) => k.startsWith('gl_'))
		.map(([name, doc]) => {
			const match = doc.signature.match(/^(\S+)/);
			const type = match ? match[1] : 'unknown';
			return { name, type, description: doc.description };
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	// Extract all non-gl_* functions from builtins doc
	const glslFunctions = Object.entries(BUILTIN_DOCS)
		.filter(([k]) => !k.startsWith('gl_'))
		.map(([name, doc]) => {
			const firstLine = doc.signature.split('\n')[0];
			const match = firstLine.match(/^(\S+)\s+(\w+)/);
			const returnType = match ? match[1] : '';
			return { name, returnType, signature: firstLine, description: doc.description };
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const groupedFunctions = (() => {
		const groups: Record<string, typeof glslFunctions> = {};
		for (const fn of glslFunctions) {
			if (!groups[fn.returnType]) groups[fn.returnType] = [];
			groups[fn.returnType].push(fn);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	})();

	const total = $derived(uniforms.length + glBuiltins.length + glslFunctions.length);

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
					{@const present = presentNames.has(u.name)}
					<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
						<button
							onclick={() => onToggle?.(u.name, u.type)}
							title={present ? `Remove uniform ${u.name}` : `Add uniform ${u.name}`}
							class="relative flex items-center justify-center w-3.5 shrink-0 self-center cursor-pointer"
						>
							<span class="block group-hover:hidden w-1.5 h-1.5 rounded-full {present ? 'bg-green-400/70' : 'bg-border'}"></span>
							<span class="hidden group-hover:block text-[11px] font-bold leading-none {present ? 'text-red-400' : 'text-cyan-400'}">{present ? '−' : '+'}</span>
						</button>
						<span class="{present ? getTypeColor(u.type) : 'text-subtle'} font-mono shrink-0 text-[11px]">{u.type}</span>
						<span class="{present ? 'text-foreground' : 'text-muted'} font-mono shrink-0 font-semibold text-[11px]">{u.name}</span>
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
					<span class="{getTypeColor(v.type)} font-mono shrink-0 text-[11px] whitespace-nowrap">{v.type}</span>
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

			<!-- GLSL built-in functions -->
			<div class="px-4 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-subtle font-semibold">
				Functions
			</div>
			{#each groupedFunctions as [returnType, functions] (returnType)}
				<div class="px-4 pt-3 pb-0.5 text-[10px] uppercase tracking-widest text-cyan-400 font-semibold">
					{returnType}
				</div>
				{#each functions as fn (fn.name)}
					{@const parsed = parseSignature(fn.signature)}
					<div class="flex items-baseline gap-1 px-4 py-1 hover:bg-panel group">
						<span class="font-mono shrink-0 text-[11px] whitespace-nowrap">
							{#if parsed}
								<span class={getTypeColor(parsed.returnType)}>{parsed.returnType}</span><span class="text-foreground">{' '}{parsed.functionName}(</span>{#each parsed.params as param, i}{#if i > 0}<span class="text-foreground">,</span>{ ' '}{/if}<span class={getTypeColor(param.type)}>{param.type}</span><span class="text-white">{' '}{param.name}</span>{/each}<span class="text-foreground">)</span>
							{:else}
								<span class="text-blue-300">{fn.signature}</span>
							{/if}
						</span>
						<span class="text-subtle flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-[11px]">
							{#each parseMarkdown(fn.description) as part}
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
			{/each}
		</div>
	{/if}
</div>
