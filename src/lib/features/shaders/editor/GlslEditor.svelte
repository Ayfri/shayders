<script lang="ts">
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
	import { saveSettings, settingsToMonaco } from '$features/shaders/editor/editor-settings';
	import type { EditorSettingsData } from '$features/shaders/editor/editor-settings';
	import { analyzeDocument } from '$lib/glsl/analyze';
	import { buildLanguage, conf } from '$lib/glsl/language';
	import { applyErrors, applyHints } from '$lib/glsl/markers';
	import { registerGlslProviders } from '$lib/glsl/providers';
	import { registerMaterialDarkerTheme } from '$lib/themes/material-darker';

	interface Props {
		value: string;
		errors?: string;
		onRun?: () => void;
		settings: EditorSettingsData;
	}

	let { value = $bindable(), errors = '', onRun, settings }: Props = $props();

	let editorContainer = $state<HTMLElement | null>(null);
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let monacoRef = $state<typeof Monaco | null>(null);
	let _settingExternal = false;
	let _lastTokenSig = '';
	const ACTIVE_EDITOR_KEY = '__glslActiveEditor';
	const GOTO_POSITION_COMMAND_ID = '__glslGotoPosition';

	function refreshDynamicTokens(src: string) {
		const m = monacoRef;
		if (!m) return;
		const doc = analyzeDocument(src);
		const structNames  = doc.structs.map((s) => s.name);
		const uniformNames = doc.variables
			.filter((v) => v.qualifier === 'uniform')
			.map((v) => v.name);
		const sig = structNames.join(',') + '|' + uniformNames.join(',');
		if (sig === _lastTokenSig) return;
		_lastTokenSig = sig;
		m.languages.setMonarchTokensProvider('glsl', buildLanguage(structNames, uniformNames));
	}

	// Editor lifecycle

	$effect(() => {
		if (!editorContainer) return;
		let cancelled = false;
		let gotoPositionCommand: Monaco.IDisposable | undefined;

		(async () => {
			const monaco = await import('monaco-editor');
			if (cancelled || !editorContainer) return;

			// Register language + theme once
			if (!monaco.languages.getLanguages().find((l) => l.id === 'glsl')) {
				monaco.languages.register({ id: 'glsl' });
			}
			// Build tokenizer with any structs/uniforms already present in the initial value
			const initialDoc     = analyzeDocument(value);
			const initialStructs  = initialDoc.structs.map((s) => s.name);
			const initialUniforms = initialDoc.variables.filter((v) => v.qualifier === 'uniform').map((v) => v.name);
			_lastTokenSig = initialStructs.join(',') + '|' + initialUniforms.join(',');
			monaco.languages.setMonarchTokensProvider('glsl', buildLanguage(initialStructs, initialUniforms));
			monaco.languages.setLanguageConfiguration('glsl', conf);

			const EditorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
			self.MonacoEnvironment = { getWorker: () => new EditorWorker.default() };

			registerMaterialDarkerTheme(monaco);
			registerGlslProviders(monaco);

			const instance = monaco.editor.create(editorContainer, {
				value,
				language: 'glsl',
				theme: 'material-darker',
				automaticLayout: true,
				fixedOverflowWidgets: true,
				padding: { top: 16 },
				wordBasedSuggestions: 'off',
				...settingsToMonaco(settings),
			});

			const globals = globalThis as Record<string, unknown>;
			globals[ACTIVE_EDITOR_KEY] = instance;
			gotoPositionCommand = monaco.editor.registerCommand(
				GOTO_POSITION_COMMAND_ID,
				(_accessor, target?: { lineNumber?: number; column?: number; uri?: string }) => {
					const activeEditor = globals[ACTIVE_EDITOR_KEY];
					if (activeEditor !== instance) return;
					const targetLine = typeof target?.lineNumber === 'number' && target.lineNumber > 0 ? target.lineNumber : 1;
					const targetColumn = typeof target?.column === 'number' && target.column > 0 ? target.column : 1;
					const model = instance.getModel();
					if (target?.uri && model && model.uri.toString() !== target.uri) return;
					instance.focus();
					instance.revealPositionInCenter({ lineNumber: targetLine, column: targetColumn });
					instance.setPosition({ lineNumber: targetLine, column: targetColumn });
				},
			);

			instance.onDidFocusEditorWidget(() => {
				globals[ACTIVE_EDITOR_KEY] = instance;
			});

			instance.onDidChangeCursorPosition(() => {
				globals[ACTIVE_EDITOR_KEY] = instance;
			});

			instance.onDidChangeModelContent(() => {
				if (_settingExternal) return;
				value = instance.getValue();
				const m = instance.getModel();
				if (m) applyHints(monaco, m);
				refreshDynamicTokens(instance.getValue());
			});

			if (onRun) {
				instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
			}

			// Initial error markers + hints
			const model = instance.getModel();
			if (model) {
				applyErrors(monaco, model, errors);
				applyHints(monaco, model);
			}

			monacoRef = monaco;
			editor = instance;
		})();

		return () => {
			const globals = globalThis as Record<string, unknown>;
			const currentEditor = editor;
			cancelled = true;
			currentEditor?.dispose();
			if (globals[ACTIVE_EDITOR_KEY] === currentEditor) {
				delete globals[ACTIVE_EDITOR_KEY];
			}
			gotoPositionCommand?.dispose();
			editor = null;
			monacoRef = null;
			_lastTokenSig = '';
		};
	});

	// Sync external value changes into Monaco (e.g. tab switch)
	$effect(() => {
		const incoming = value;
		if (!editor) return;
		if (editor.getValue() === incoming) return;
		_settingExternal = true;
		editor.setValue(incoming);
		_settingExternal = false;
		// Re-apply hints for the new content (marker owners survive setValue)
		const m = monacoRef;
		const model = editor.getModel();
		if (m && model) applyHints(m, model);
		refreshDynamicTokens(incoming);
	});

	// Reactively update error markers

	$effect(() => {
		const m = monacoRef;
		const ed = editor;
		if (!m || !ed) return;
		const model = ed.getModel();
		if (!model) return;
		applyErrors(m, model, errors);
	});

	// Apply settings changes to editor + persist

	$effect(() => {
		const s = { ...settings };
		saveSettings(s);
		editor?.updateOptions(settingsToMonaco(s));
	});
</script>

<div class="editor-root">
	<div bind:this={editorContainer} class="flex-1 w-full min-h-0"></div>
</div>

<style>
	.editor-root {
		position: relative;
		display: flex;
		flex: 1;
		width: 100%;
		min-height: 0;
	}
</style>
