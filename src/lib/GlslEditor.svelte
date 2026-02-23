<script lang="ts">
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
	import { buildLanguage, conf } from '$lib/glsl/language';
	import { analyzeDocument } from '$lib/glsl/analyze';
	import { registerGlslProviders } from '$lib/glsl/providers';
	import { applyErrors, applyHints } from '$lib/glsl/markers';
	import { registerMaterialDarkerTheme } from '$lib/themes/materialDarker';

	interface Props {
		value: string;
		errors?: string;
		onRun?: () => void;
	}

	let { value = $bindable(), errors = '', onRun }: Props = $props();

	let editorContainer = $state<HTMLElement | null>(null);
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let monacoRef = $state<typeof Monaco | null>(null);
	let _settingExternal = false;
	let _lastTokenSig = '';

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
				fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
				fontSize: 14,
				lineHeight: 22,
				minimap: { enabled: false },
				padding: { top: 16 },
				// Intellisense
				hover: { enabled: true },
				suggest: { showWords: true, showSnippets: true },
				quickSuggestions: { other: true, comments: false, strings: false },
				parameterHints: { enabled: true },
				inlayHints: { enabled: 'on' },
				wordBasedSuggestions: 'off',
				// UX
				smoothScrolling: true,
				cursorSmoothCaretAnimation: 'on',
				bracketPairColorization: { enabled: true },
				renderLineHighlight: 'gutter',
				folding: true,
				foldingStrategy: 'indentation',
				scrollBeyondLastLine: false,
				fixedOverflowWidgets: true,
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
			cancelled = true;
			editor?.dispose();
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
</script>

<div bind:this={editorContainer} class="flex-1 w-full min-h-0"></div>
