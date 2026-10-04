<script lang="ts" module>
	import { EDITOR_DEFAULTS, type EditorSettingsData } from '#features/shaders/editor/editor-settings.svelte.js';

	type KeysOf<T> = { [K in keyof EditorSettingsData]: EditorSettingsData[K] extends T ? K : never }[keyof EditorSettingsData];

	type SettingControl =
		| { key: KeysOf<boolean>; kind: 'toggle'; label: string }
		| { key: KeysOf<number>; kind: 'range'; label: string; max: number; min: number }
		| { disabledUnless?: KeysOf<boolean>; key: KeysOf<string>; kind: 'select'; label: string; options: [value: string, label: string][] };

	const SECTIONS: { controls: SettingControl[]; title: string }[] = [
		{
			controls: [
				{
					key: 'fontFamily',
					kind: 'select',
					label: 'Font family',
					options: [
						[EDITOR_DEFAULTS.fontFamily, 'JetBrains Mono'],
						["'Fira Code', monospace", 'Fira Code'],
						["'Cascadia Code', monospace", 'Cascadia Code'],
						["'Source Code Pro', monospace", 'Source Code Pro'],
						["'Inconsolata', monospace", 'Inconsolata'],
						['monospace', 'System monospace'],
					],
				},
				{ key: 'fontSize', kind: 'range', label: 'Font size', max: 24, min: 10 },
				{ key: 'lineHeight', kind: 'range', label: 'Line height', max: 40, min: 16 },
			],
			title: 'Appearance',
		},
		{ controls: [{ key: 'bufferPreviews', kind: 'toggle', label: 'Buffer previews' }], title: 'Tabs' },
		{
			controls: [
				{ key: 'bracketPairColorization', kind: 'toggle', label: 'Bracket pair colorization' },
				{ key: 'folding', kind: 'toggle', label: 'Code folding' },
				{ key: 'foldingStrategy', kind: 'select', label: 'Folding strategy', options: [['indentation', 'Indentation'], ['auto', 'Auto']] },
				{ key: 'matchBrackets', kind: 'select', label: 'Match brackets', options: [['always', 'Always'], ['near', 'Near'], ['never', 'Never']] },
				{ key: 'minimapEnabled', kind: 'toggle', label: 'Minimap' },
				{ disabledUnless: 'minimapEnabled', key: 'minimapSize', kind: 'select', label: 'Minimap size', options: [['proportional', 'Proportional'], ['fill', 'Fill'], ['fit', 'Fit']] },
				{ key: 'renderLineHighlight', kind: 'select', label: 'Line highlight', options: [['gutter', 'Gutter'], ['line', 'Line'], ['all', 'All'], ['none', 'None']] },
				{
					key: 'renderWhitespace',
					kind: 'select',
					label: 'Render whitespace',
					options: [['selection', 'Selection'], ['boundary', 'Boundary'], ['trailing', 'Trailing'], ['all', 'All'], ['none', 'None']],
				},
				{ key: 'stickyScroll', kind: 'toggle', label: 'Sticky scroll' },
				{ key: 'wordWrap', kind: 'select', label: 'Word wrap (Alt+Z)', options: [['off', 'Off'], ['on', 'On']] },
			],
			title: 'Display',
		},
		{
			controls: [
				{ key: 'contextmenu', kind: 'toggle', label: 'Context menu' },
				{ key: 'copyWithSyntaxHighlighting', kind: 'toggle', label: 'Copy with syntax highlighting' },
				{ key: 'cursorSmoothCaretAnimation', kind: 'select', label: 'Cursor animation', options: [['on', 'On'], ['explicit', 'Explicit'], ['off', 'Off']] },
				{ key: 'formatOnPaste', kind: 'toggle', label: 'Format on paste' },
				{ key: 'mouseWheelZoom', kind: 'toggle', label: 'Mouse wheel zoom (Ctrl)' },
				{ key: 'scrollBeyondLastLine', kind: 'toggle', label: 'Scroll beyond last line' },
				{ key: 'smoothScrolling', kind: 'toggle', label: 'Smooth scrolling' },
			],
			title: 'Behavior',
		},
		{
			controls: [
				{ key: 'colorDecorators', kind: 'toggle', label: 'Color pickers' },
				{ key: 'hoverEnabled', kind: 'toggle', label: 'Hover tooltips' },
				{ key: 'inlayHints', kind: 'select', label: 'Inlay hints', options: [['on', 'On'], ['offUnlessPressed', 'On press (Ctrl+Alt)'], ['off', 'Off']] },
				{ key: 'parameterHints', kind: 'toggle', label: 'Parameter hints' },
				{ key: 'quickSuggestions', kind: 'toggle', label: 'Quick suggestions' },
				{ key: 'showSnippets', kind: 'toggle', label: 'Show snippets' },
				{ key: 'showWords', kind: 'toggle', label: 'Show word suggestions' },
			],
			title: 'IntelliSense',
		},
	];
</script>

<script lang="ts">
	import { editorSettings as settings, resetEditorSettings } from '#features/shaders/editor/editor-settings.svelte.js';
	import Modal from '#components/ui/Modal.svelte';
	import SettingRow from '#components/ui/SettingRow.svelte';

	interface Props {
		onClose: () => void;
		open: boolean;
	}

	let { onClose, open = false }: Props = $props();

	function resetSetting(key: keyof EditorSettingsData) {
		Object.assign(settings, { [key]: EDITOR_DEFAULTS[key] });
	}
</script>

<Modal {open} {onClose} title="Editor settings">
	<div class="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
		{#each SECTIONS as section (section.title)}
			<section>
				<h3 class="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">{section.title}</h3>
				<div class="space-y-4">
					{#each section.controls as control (control.key)}
						<SettingRow label={control.label} changed={settings[control.key] !== EDITOR_DEFAULTS[control.key]} onReset={() => resetSetting(control.key)}>
							{#if control.kind === 'toggle'}
								<input type="checkbox" bind:checked={settings[control.key]} aria-label={control.label} class="size-4 accent-muted" />
							{:else if control.kind === 'range'}
								<input type="range" min={control.min} max={control.max} step="1" bind:value={settings[control.key]} aria-label={control.label} class="w-32 accent-muted" />
								<span class="w-8 text-xs text-foreground/70">{settings[control.key]}px</span>
							{:else}
								<select
									bind:value={settings[control.key]}
									disabled={control.disabledUnless && !settings[control.disabledUnless]}
									aria-label={control.label}
									class="w-32 rounded border border-border bg-panel px-2 py-1 text-xs text-foreground focus:border-muted focus:outline-none disabled:opacity-30"
								>
									{#each control.options as [value, label] (value)}
										<option {value}>{label}</option>
									{/each}
								</select>
							{/if}
						</SettingRow>
					{/each}
				</div>
			</section>
		{/each}
	</div>

	<div class="flex items-center justify-between border-t border-border bg-background px-5 py-3">
		<button
			onclick={() => {
				resetEditorSettings();
				onClose();
			}}
			class="btn-ghost px-3 py-1.5 text-xs"
		>
			Reset all to defaults
		</button>
		<button onclick={onClose} class="btn-accent px-4 py-1.5 text-xs font-medium">Close</button>
	</div>
</Modal>
