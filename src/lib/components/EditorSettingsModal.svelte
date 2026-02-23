<script lang="ts">
	import type { EditorSettingsData } from '$lib/editorSettings';
	import { EDITOR_DEFAULTS } from '$lib/editorSettings';
	import Modal from '$lib/components/Modal.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';

	interface Props {
		open: boolean;
		settings: EditorSettingsData;
		onClose: () => void;
		onReset: () => void;
	}

	let { open = false, settings = $bindable(), onClose, onReset }: Props = $props();

	function rb<K extends keyof EditorSettingsData>(key: K) {
		return () => ((settings[key] as EditorSettingsData[K]) = EDITOR_DEFAULTS[key]);
	}

	function changed<K extends keyof EditorSettingsData>(key: K): boolean {
		return settings[key] !== EDITOR_DEFAULTS[key];
	}

	const sel = 'cursor-pointer text-xs bg-panel border border-border text-foreground rounded px-2 py-1 w-32 focus:outline-none focus:border-muted';
	const chk = 'cursor-pointer w-4 h-4 accent-muted';
</script>

<Modal {open} {onClose} title="Editor settings">
	<div class="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-5">
		<section>
			<h3 class="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Appearance</h3>
			<div class="space-y-4">
				<SettingRow label="Font family" changed={changed('fontFamily')} onReset={rb('fontFamily')}>
					<select bind:value={settings.fontFamily} class={sel}>
						<option value="'JetBrains Mono', 'Fira Code', monospace">JetBrains Mono</option>
						<option value="'Fira Code', monospace">Fira Code</option>
						<option value="'Cascadia Code', monospace">Cascadia Code</option>
						<option value="'Source Code Pro', monospace">Source Code Pro</option>
						<option value="'Inconsolata', monospace">Inconsolata</option>
						<option value="monospace">System monospace</option>
					</select>
				</SettingRow>

				<SettingRow label="Font size" changed={changed('fontSize')} onReset={rb('fontSize')}>
					<div class="flex items-center gap-2">
						<input type="range" min="10" max="24" step="1" bind:value={settings.fontSize} class="cursor-pointer w-32 accent-muted" />
						<span class="text-xs text-foreground opacity-70">{settings.fontSize}px</span>
					</div>
				</SettingRow>

				<SettingRow label="Line height" changed={changed('lineHeight')} onReset={rb('lineHeight')}>
					<div class="flex items-center gap-2">
						<input type="range" min="16" max="40" step="1" bind:value={settings.lineHeight} class="cursor-pointer w-32 accent-muted" />
						<span class="text-xs text-foreground opacity-70">{settings.lineHeight}px</span>
					</div>
				</SettingRow>
			</div>
		</section>

		<section>
			<h3 class="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Display</h3>
			<div class="space-y-4">
				<SettingRow label="Bracket pair colorization" changed={changed('bracketPairColorization')} onReset={rb('bracketPairColorization')}>
					<input type="checkbox" bind:checked={settings.bracketPairColorization} class={chk} />
				</SettingRow>

				<SettingRow label="Code folding" changed={changed('folding')} onReset={rb('folding')}>
					<input type="checkbox" bind:checked={settings.folding} class={chk} />
				</SettingRow>

				<SettingRow label="Folding strategy" changed={changed('foldingStrategy')} onReset={rb('foldingStrategy')}>
					<select bind:value={settings.foldingStrategy} class={sel}>
						<option value="indentation">Indentation</option>
						<option value="auto">Auto</option>
					</select>
				</SettingRow>

				<SettingRow label="Match brackets" changed={changed('matchBrackets')} onReset={rb('matchBrackets')}>
					<select bind:value={settings.matchBrackets} class={sel}>
						<option value="always">Always</option>
						<option value="near">Near</option>
						<option value="never">Never</option>
					</select>
				</SettingRow>

				<SettingRow label="Minimap" changed={changed('minimapEnabled')} onReset={rb('minimapEnabled')}>
					<input type="checkbox" bind:checked={settings.minimapEnabled} class={chk} />
				</SettingRow>

				<SettingRow label="Minimap size" changed={changed('minimapSize')} onReset={rb('minimapSize')}>
					<select bind:value={settings.minimapSize} disabled={!settings.minimapEnabled} class="{sel} disabled:opacity-30 disabled:cursor-not-allowed">
						<option value="proportional">Proportional</option>
						<option value="fill">Fill</option>
						<option value="fit">Fit</option>
					</select>
				</SettingRow>

				<SettingRow label="Line highlight" changed={changed('renderLineHighlight')} onReset={rb('renderLineHighlight')}>
					<select bind:value={settings.renderLineHighlight} class={sel}>
						<option value="gutter">Gutter</option>
						<option value="line">Line</option>
						<option value="all">All</option>
						<option value="none">None</option>
					</select>
				</SettingRow>

				<SettingRow label="Word wrap" changed={changed('wordWrap')} onReset={rb('wordWrap')}>
					<select bind:value={settings.wordWrap} class={sel}>
						<option value="off">Off</option>
						<option value="on">On</option>
					</select>
				</SettingRow>
			</div>
		</section>

		<section>
			<h3 class="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Behavior</h3>
			<div class="space-y-4">
				<SettingRow label="Context menu" changed={changed('contextmenu')} onReset={rb('contextmenu')}>
					<input type="checkbox" bind:checked={settings.contextmenu} class={chk} />
				</SettingRow>

				<SettingRow label="Copy with syntax highlighting" changed={changed('copyWithSyntaxHighlighting')} onReset={rb('copyWithSyntaxHighlighting')}>
					<input type="checkbox" bind:checked={settings.copyWithSyntaxHighlighting} class={chk} />
				</SettingRow>

				<SettingRow label="Cursor animation" changed={changed('cursorSmoothCaretAnimation')} onReset={rb('cursorSmoothCaretAnimation')}>
					<select bind:value={settings.cursorSmoothCaretAnimation} class={sel}>
						<option value="on">On</option>
						<option value="explicit">Explicit</option>
						<option value="off">Off</option>
					</select>
				</SettingRow>

				<SettingRow label="Format on paste" changed={changed('formatOnPaste')} onReset={rb('formatOnPaste')}>
					<input type="checkbox" bind:checked={settings.formatOnPaste} class={chk} />
				</SettingRow>

				<SettingRow label="Mouse wheel zoom (Ctrl)" changed={changed('mouseWheelZoom')} onReset={rb('mouseWheelZoom')}>
					<input type="checkbox" bind:checked={settings.mouseWheelZoom} class={chk} />
				</SettingRow>

				<SettingRow label="Scroll beyond last line" changed={changed('scrollBeyondLastLine')} onReset={rb('scrollBeyondLastLine')}>
					<input type="checkbox" bind:checked={settings.scrollBeyondLastLine} class={chk} />
				</SettingRow>

				<SettingRow label="Smooth scrolling" changed={changed('smoothScrolling')} onReset={rb('smoothScrolling')}>
					<input type="checkbox" bind:checked={settings.smoothScrolling} class={chk} />
				</SettingRow>
			</div>
		</section>

		<section>
			<h3 class="text-sm font-bold text-foreground uppercase tracking-wide mb-3">IntelliSense</h3>
			<div class="space-y-4">
				<SettingRow label="Hover tooltips" changed={changed('hoverEnabled')} onReset={rb('hoverEnabled')}>
					<input type="checkbox" bind:checked={settings.hoverEnabled} class={chk} />
				</SettingRow>

				<SettingRow label="Inlay hints" changed={changed('inlayHints')} onReset={rb('inlayHints')}>
					<select bind:value={settings.inlayHints} class={sel}>
						<option value="on">On</option>
						<option value="offUnlessPressed">On press (Ctrl+Alt)</option>
						<option value="off">Off</option>
					</select>
				</SettingRow>

				<SettingRow label="Parameter hints" changed={changed('parameterHints')} onReset={rb('parameterHints')}>
					<input type="checkbox" bind:checked={settings.parameterHints} class={chk} />
				</SettingRow>

				<SettingRow label="Quick suggestions" changed={changed('quickSuggestions')} onReset={rb('quickSuggestions')}>
					<input type="checkbox" bind:checked={settings.quickSuggestions} class={chk} />
				</SettingRow>

				<SettingRow label="Show snippets" changed={changed('showSnippets')} onReset={rb('showSnippets')}>
					<input type="checkbox" bind:checked={settings.showSnippets} class={chk} />
				</SettingRow>

				<SettingRow label="Show word suggestions" changed={changed('showWords')} onReset={rb('showWords')}>
					<input type="checkbox" bind:checked={settings.showWords} class={chk} />
				</SettingRow>
			</div>
		</section>

	</div>

	<div class="px-5 py-3 border-t border-border bg-background flex items-center justify-between">
		<button
			onclick={onReset}
			class="cursor-pointer text-xs px-3 py-1.5 border border-border text-subtle hover:text-foreground hover:border-muted rounded transition-colors"
		>
			Reset all to defaults
		</button>
		<button
			onclick={onClose}
			class="cursor-pointer text-xs px-4 py-1.5 bg-panel border border-border text-foreground hover:bg-muted hover:border-muted hover:text-background rounded font-medium transition-colors"
		>
			Close
		</button>
	</div>
</Modal>
