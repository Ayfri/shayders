<script lang="ts">
	import type * as Monaco from 'monaco-editor/editor';
	import { editorSettings, settingsToMonaco } from '#features/shaders/editor/editor-settings.svelte.js';
	import type { ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { conf, language } from '#lib/glsl/language.js';
	import { applyErrors, applyHints } from '#lib/glsl/markers.js';
	import { registerGlslProviders } from '#lib/glsl/providers.js';
	import { registerMaterialDarkerTheme } from '#lib/themes/material-darker.js';

	interface Props {
		activeBufferId: string;
		buffers: ShaderBuffer[];
		value: string;
		errors?: string;
		onBufferFocus?: (id: string) => void;
		onPreview?: (bufferId: string, code: string) => void;
		onRun?: () => void;
	}

	let { activeBufferId, buffers, value = $bindable(), errors = '', onBufferFocus, onPreview, onRun }: Props = $props();

	const ACTIVE_EDITOR_KEY = '__glslActiveEditor';
	const ANALYSIS_DEBOUNCE_MS = 120;
	const GOTO_POSITION_COMMAND_ID = '__glslGotoPosition';
	const WORKSPACE_SCHEME = 'glsl-buffer';

	let editorContainer = $state<HTMLElement | null>(null);
	let editor = $state.raw<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let monacoApi = $state.raw<typeof Monaco | null>(null);
	let analysisTimer = 0;
	let settingExternalValue = false;
	let workspaceId = '';

	function bufferIdFromPath(path: string): string {
		return path.startsWith('/') ? path.slice(1) : path;
	}

	function getWorkspaceModels(monaco: typeof Monaco): Monaco.editor.ITextModel[] {
		return monaco.editor.getModels().filter((model) => model.uri.scheme === WORKSPACE_SCHEME && model.uri.authority === workspaceId);
	}

	function getWorkspaceModel(monaco: typeof Monaco, bufferId: string): Monaco.editor.ITextModel | null {
		return getWorkspaceModels(monaco).find((model) => model.uri.path === `/${bufferId}`) ?? null;
	}

	function ensureWorkspaceModel(monaco: typeof Monaco, buffer: ShaderBuffer): Monaco.editor.ITextModel {
		const uri = monaco.Uri.from({ authority: workspaceId, path: `/${buffer.id}`, scheme: WORKSPACE_SCHEME });
		return monaco.editor.getModel(uri) ?? monaco.editor.createModel(buffer.code, 'glsl', uri);
	}

	/** Refreshes unused-symbol hints across every buffer of the workspace. */
	function refreshAnalysis(monaco: typeof Monaco): void {
		const models = getWorkspaceModels(monaco);
		const sources = models.map((model) => model.getValue());
		for (const model of models) applyHints(monaco, model, sources);
	}

	function scheduleAnalysis(monaco: typeof Monaco): void {
		window.clearTimeout(analysisTimer);
		analysisTimer = window.setTimeout(() => refreshAnalysis(monaco), ANALYSIS_DEBOUNCE_MS);
	}

	$effect(() => {
		const container = editorContainer;
		if (!container) return;
		let cancelled = false;
		const disposables: Monaco.IDisposable[] = [];
		const globals = globalThis as Record<string, unknown>;

		void (async () => {
			const [monaco, , { default: EditorWorker }] = await Promise.all([
				import('monaco-editor/editor'),
				import('monaco-editor/features/register.all'),
				import('monaco-editor/editor/editor.worker?worker'),
			]);
			if (cancelled) return;

			self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
			workspaceId = crypto.randomUUID();
			if (!monaco.languages.getLanguages().some((language) => language.id === 'glsl')) {
				monaco.languages.register({ id: 'glsl' });
			}
			monaco.languages.setLanguageConfiguration('glsl', conf);
			monaco.languages.setMonarchTokensProvider('glsl', language);
			registerMaterialDarkerTheme(monaco);
			registerGlslProviders(monaco, (model, code) => {
				if (model.uri.scheme === WORKSPACE_SCHEME && model.uri.authority === workspaceId) onPreview?.(bufferIdFromPath(model.uri.path), code);
			});

			for (const buffer of buffers) ensureWorkspaceModel(monaco, buffer);
			const initialModel = getWorkspaceModel(monaco, activeBufferId) ?? getWorkspaceModels(monaco)[0] ?? null;
			if (initialModel?.uri.path === `/${activeBufferId}` && initialModel.getValue() !== value) {
				initialModel.setValue(value);
			}

			const instance = monaco.editor.create(container, {
				automaticLayout: true,
				fixedOverflowWidgets: true,
				language: 'glsl',
				model: initialModel,
				padding: { top: 16 },
				'semanticHighlighting.enabled': true,
				theme: 'material-darker',
				wordBasedSuggestions: 'off',
				...settingsToMonaco(editorSettings),
			});
			globals[ACTIVE_EDITOR_KEY] = instance;

			const wrapGutter = instance.createDecorationsCollection();
			/** One whole-document decoration tags every gutter row, only continuation rows of wrapped lines are empty and get the CSS arrow. */
			const updateWrapGutter = () => {
				const lineCount = instance.getModel()?.getLineCount() ?? 0;
				if (wrapGutter.length > 0 && wrapGutter.getRange(0)?.endLineNumber === lineCount) return;
				wrapGutter.set(lineCount > 0 ? [{ options: { isWholeLine: true, lineNumberClassName: 'glsl-wrap-gutter' }, range: new monaco.Range(1, 1, lineCount, 1) }] : []);
			};
			updateWrapGutter();

			disposables.push(
				instance,
				instance.addAction({
					id: 'glsl.toggleWordWrap',
					keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
					label: 'Toggle Word Wrap',
					run: () => {
						editorSettings.wordWrap = editorSettings.wordWrap === 'on' ? 'off' : 'on';
					},
				}),
				instance.onDidChangeModel(() => {
					wrapGutter.clear();
					updateWrapGutter();
				}),
				monaco.editor.registerEditorOpener({
					openCodeEditor(source, resource, selectionOrPosition) {
						if (source !== instance || resource.scheme !== WORKSPACE_SCHEME || resource.authority !== workspaceId) return false;
						const targetModel = monaco.editor.getModel(resource);
						if (!targetModel) return false;
						onBufferFocus?.(bufferIdFromPath(resource.path));
						instance.setModel(targetModel);
						instance.focus();

						if (selectionOrPosition && 'startLineNumber' in selectionOrPosition) {
							instance.setSelection(selectionOrPosition);
							instance.revealRangeInCenter(selectionOrPosition);
						} else if (selectionOrPosition) {
							instance.setPosition(selectionOrPosition);
							instance.revealPositionInCenter(selectionOrPosition);
						}

						globals[ACTIVE_EDITOR_KEY] = instance;
						return true;
					},
				}),
				monaco.editor.registerCommand(
					GOTO_POSITION_COMMAND_ID,
					(_accessor, target?: { lineNumber?: number; column?: number; uri?: string }) => {
						if (globals[ACTIVE_EDITOR_KEY] !== instance) return;
						const model = instance.getModel();
						if (target?.uri && model && model.uri.toString() !== target.uri) return;
						const position = {
							column: target?.column && target.column > 0 ? target.column : 1,
							lineNumber: target?.lineNumber && target.lineNumber > 0 ? target.lineNumber : 1,
						};
						instance.focus();
						instance.revealPositionInCenter(position);
						instance.setPosition(position);
					},
				),
				instance.onDidFocusEditorWidget(() => (globals[ACTIVE_EDITOR_KEY] = instance)),
				instance.onDidChangeCursorPosition(() => (globals[ACTIVE_EDITOR_KEY] = instance)),
				instance.onDidChangeModelContent(() => {
					updateWrapGutter();
					if (settingExternalValue) return;
					const model = instance.getModel();
					if (!model) return;
					value = model.getValue();
					scheduleAnalysis(monaco);
				}),
			);

			if (onRun) instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);

			const model = instance.getModel();
			if (model) applyErrors(monaco, model, errors);
			refreshAnalysis(monaco);

			monacoApi = monaco;
			editor = instance;
		})();

		return () => {
			cancelled = true;
			window.clearTimeout(analysisTimer);
			if (globals[ACTIVE_EDITOR_KEY] === editor) delete globals[ACTIVE_EDITOR_KEY];
			for (const disposable of disposables) disposable.dispose();
			for (const model of monacoApi ? getWorkspaceModels(monacoApi) : []) model.dispose();
			editor = null;
			monacoApi = null;
		};
	});

	/** Pushes external value changes (tab switch, uniform toggles, Shadertoy conversion) into the active model. */
	$effect(() => {
		const incoming = value;
		const monaco = monacoApi;
		if (!monaco || !editor) return;
		const activeModel = getWorkspaceModel(monaco, activeBufferId);
		if (!activeModel) return;
		if (editor.getModel() !== activeModel) editor.setModel(activeModel);
		if (activeModel.getValue() === incoming) return;
		settingExternalValue = true;
		activeModel.setValue(incoming);
		settingExternalValue = false;
		scheduleAnalysis(monaco);
	});

	/** Mirrors the buffer list into Monaco models, the active buffer's content is owned by the value effect above. */
	$effect(() => {
		const monaco = monacoApi;
		if (!monaco || !editor) return;
		const ids = new Set(buffers.map((buffer) => buffer.id));
		for (const model of getWorkspaceModels(monaco)) {
			if (!ids.has(bufferIdFromPath(model.uri.path))) model.dispose();
		}
		for (const buffer of buffers) {
			const model = ensureWorkspaceModel(monaco, buffer);
			if (buffer.id !== activeBufferId && model.getValue() !== buffer.code) model.setValue(buffer.code);
		}
		const activeModel = getWorkspaceModel(monaco, activeBufferId);
		if (activeModel && editor.getModel() !== activeModel) editor.setModel(activeModel);
		scheduleAnalysis(monaco);
	});

	$effect(() => {
		const monaco = monacoApi;
		const model = editor?.getModel();
		if (monaco && model) applyErrors(monaco, model, errors);
	});

	$effect(() => {
		const options = settingsToMonaco(editorSettings);
		editor?.updateOptions(options);
	});
</script>

<div class="relative flex min-h-0 w-full flex-1">
	<div bind:this={editorContainer} class="min-h-0 w-full flex-1"></div>
</div>

<style>
	:global(.monaco-editor .line-numbers.glsl-wrap-gutter:empty::before) {
		content: '↪';
		opacity: 0.4;
	}
</style>
