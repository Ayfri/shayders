<script lang="ts" module>
	import { BUILTIN_CATEGORIES, BUILTIN_DOCS, BUILTIN_VARIABLE_DOC_ENTRIES, type GlslDoc } from '#lib/glsl/builtins.js';

	type MarkdownPart = string | { type: 'italic' | 'bold' | 'code'; content: string };

	interface ParsedSignature {
		functionName: string;
		params: { name: string; type: string }[];
		returnType: string;
	}

	interface Entry {
		doc: GlslDoc;
		/** Lowercased name and description, matched against the search field. */
		haystack: string;
		name: string;
		signatures: ParsedSignature[];
		type: string;
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
		if (/^[d]?mat[234](x[234])?$|^matN/.test(type)) return 'text-amber-400';
		if (/^(float|int|bool|uint|double|genType|genBType)$/.test(type)) return 'text-emerald-400';
		if (/^(image|sampler)/.test(type)) return 'text-rose-400';
		return 'text-cyan-400';
	}

	function entryOf(name: string, doc: GlslDoc): Entry {
		return {
			doc,
			haystack: `${name} ${doc.description}`.toLowerCase(),
			name,
			signatures: doc.signature.split('\n').flatMap((signature) => parseSignature(signature) ?? []),
			type: doc.signature.match(/^(\S+)/)?.[1] ?? '',
		};
	}

	/** Fragment-only built-in variables are shown in the panel. */
	const glBuiltins = BUILTIN_VARIABLE_DOC_ENTRIES.map(([name, doc]) => entryOf(name, doc)).sort((a, b) => a.name.localeCompare(b.name));
	const categories = BUILTIN_CATEGORIES.map(({ label, names }) => ({ entries: names.map((name) => entryOf(name, BUILTIN_DOCS[name])), label }));
	const functionCount = categories.reduce((count, category) => count + category.entries.length, 0);
</script>

<script lang="ts">
	import { ChevronDown, ChevronRight, Search, Variable } from '@lucide/svelte';
	import type { UniformDescriptor } from '#features/shaders/editor/uniforms.js';

	interface Props {
		onToggle?: (name: string, type: string) => void;
		open?: boolean;
		presentNames?: Set<string>;
		uniforms?: UniformDescriptor[];
		values?: Record<string, string>;
	}

	let { onToggle, open = $bindable(false), presentNames = new Set(), uniforms = [], values = {} }: Props = $props();

	let query = $state('');
	let expanded = $state<string | null>(null);

	const needle = $derived(query.trim().toLowerCase());
	const visibleUniforms = $derived(uniforms.filter((u) => !needle || `${u.name} ${u.description ?? ''}`.toLowerCase().includes(needle)));
	const visibleVariables = $derived(glBuiltins.filter((entry) => entry.haystack.includes(needle)));
	const visibleCategories = $derived(categories.map((category) => ({ ...category, entries: category.entries.filter((entry) => entry.haystack.includes(needle)) })).filter((category) => category.entries.length > 0));
	const total = $derived(uniforms.length + glBuiltins.length + functionCount);
</script>

{#snippet markdown(text: string)}
	{#each parseMarkdown(text) as part}
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

{#snippet signature(parsed: ParsedSignature)}
	<span class={getTypeColor(parsed.returnType)}>{parsed.returnType}</span><span class="text-foreground">{' '}{parsed.functionName}(</span>{#each parsed.params as param, i}{#if i > 0}<span class="text-foreground">,</span>{' '}{/if}<span class={getTypeColor(param.type)}>{param.type}</span><span class="text-white">{' '}{param.name}</span>{/each}<span class="text-foreground">)</span>
{/snippet}

{#snippet details(entry: Entry)}
	<div class="flex flex-col gap-1.5 px-4 pb-2 pt-0.5 pl-6 text-11 leading-snug">
		{#if entry.signatures.length > 1}
			<div class="flex flex-col font-mono">
				{#each entry.signatures as parsed}
					<span class="whitespace-nowrap">{@render signature(parsed)}</span>
				{/each}
			</div>
		{/if}
		{#if entry.doc.extension}
			<span class="text-amber-300">Needs <code class="bg-background px-0.5 rounded">#extension {entry.doc.extension} : enable</code></span>
		{/if}
		{#if entry.doc.params}
			<ul class="flex flex-col gap-0.5 text-foreground/85">
				{#each Object.entries(entry.doc.params) as [name, text] (name)}
					<li><code class="text-white">{name}</code>: {@render markdown(text)}</li>
				{/each}
			</ul>
		{/if}
		{#if entry.doc.details}
			<p class="text-foreground/85">{@render markdown(entry.doc.details)}</p>
		{/if}
		{#if entry.doc.examples}
			<pre class="m-0 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-blue-200">{entry.doc.examples.join('\n')}</pre>
		{/if}
	</div>
{/snippet}

{#snippet sectionTitle(label: string)}
	<div class="px-4 pt-2 pb-0.5 text-10 uppercase tracking-widest text-subtle font-semibold">{label}</div>
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
		<label class="mx-4 mb-1 flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs text-muted focus-within:border-cyan-400/60">
			<Search size={12} class="shrink-0" />
			<input bind:value={query} placeholder="Search a function, a uniform…" class="w-full bg-transparent text-foreground outline-none placeholder:text-subtle" />
		</label>
		<div class="overflow-y-auto max-h-100 mb-2 text-xs">
			{#if visibleUniforms.length > 0}
				{@render sectionTitle('Uniforms')}
				{#each visibleUniforms as u (u.name)}
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
							<span class="text-muted flex-1 ml-1 truncate group-hover:whitespace-normal group-hover:overflow-visible leading-snug text-11">
								{@render markdown(u.description)}
							</span>
						{/if}
						{#if values[u.name] !== undefined}
							<span class="ml-auto font-mono text-green-400 shrink-0 tabular-nums text-11">{values[u.name]}</span>
						{/if}
					</div>
				{/each}
			{/if}

			{#if visibleVariables.length > 0}
				{@render sectionTitle('Built-in variables')}
				{#each visibleVariables as entry (entry.name)}
					<button onclick={() => (expanded = expanded === entry.name ? null : entry.name)} class="flex w-full items-baseline gap-1 px-4 py-1 text-left hover:bg-panel group cursor-pointer">
						<span class="{getTypeColor(entry.type)} font-mono shrink-0 text-11 whitespace-nowrap">{entry.type}</span>
						<span class="text-foreground font-mono shrink-0 font-semibold text-11 whitespace-nowrap">{entry.name}</span>
						<span class="text-muted ml-1 flex-1 leading-snug text-11 {expanded === entry.name ? '' : 'truncate'}">{@render markdown(entry.doc.description)}</span>
					</button>
					{#if expanded === entry.name}{@render details(entry)}{/if}
				{/each}
			{/if}

			{#each visibleCategories as category (category.label)}
				{@render sectionTitle(category.label)}
				{#each category.entries as entry (entry.name)}
					<button onclick={() => (expanded = expanded === entry.name ? null : entry.name)} class="flex w-full items-baseline gap-1 px-4 py-1 text-left hover:bg-panel group cursor-pointer">
						<span class="font-mono shrink-0 text-11 whitespace-nowrap">
							{#if entry.signatures[0]}{@render signature(entry.signatures[0])}{:else}<span class="text-blue-300">{entry.name}</span>{/if}
						</span>
						{#if entry.doc.extension}
							<span title="Needs #extension {entry.doc.extension}" class="shrink-0 rounded bg-amber-400/15 px-1 text-10 text-amber-300">ext</span>
						{/if}
						<span class="text-muted ml-1 flex-1 leading-snug text-11 {expanded === entry.name ? '' : 'truncate'}">{@render markdown(entry.doc.description)}</span>
					</button>
					{#if expanded === entry.name}{@render details(entry)}{/if}
				{/each}
			{/each}

			{#if visibleUniforms.length + visibleVariables.length + visibleCategories.length === 0}
				<p class="px-4 py-2 text-subtle text-11">Nothing matches "{query}".</p>
			{/if}
		</div>
	{/if}
</div>
