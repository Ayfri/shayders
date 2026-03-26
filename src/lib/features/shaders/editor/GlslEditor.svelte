<script lang="ts">
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
	import { saveSettings, settingsToMonaco } from '$features/shaders/editor/editor-settings';
	import type { EditorSettingsData } from '$features/shaders/editor/editor-settings';
	import { analyzeDocument } from '$lib/glsl/analyze';
	import { buildLanguage, conf } from '$lib/glsl/language';
	import { applyErrors, applyHints } from '$lib/glsl/markers';
	import { registerGlslProviders } from '$lib/glsl/providers';
	import { registerMaterialDarkerTheme } from '$lib/themes/material-darker';
	import type { ShaderBuffer } from '$features/shaders/model/shader-content';

	interface Props {
		activeBufferId: string;
		buffers: ShaderBuffer[];
		value: string;
		errors?: string;
		onBufferFocus?: (id: string) => void;
		onRun?: () => void;
		settings: EditorSettingsData;
	}

	let { activeBufferId, buffers, value = $bindable(), errors = '', onBufferFocus, onRun, settings }: Props = $props();

	let editorContainer = $state<HTMLElement | null>(null);
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let monacoRef = $state<typeof Monaco | null>(null);
	let workspaceId = '';
	let _settingExternal = false;
	let _lastTokenSig = '';
	const ACTIVE_EDITOR_KEY = '__glslActiveEditor';
	const GOTO_POSITION_COMMAND_ID = '__glslGotoPosition';
	const WORKSPACE_SCHEME = 'glsl-buffer';

	const workspaceModelUri = (monaco: typeof Monaco, bufferId: string): Monaco.Uri => (
		monaco.Uri.from({
			authority: workspaceId,
			path: `/${bufferId}`,
			scheme: WORKSPACE_SCHEME,
		})
	);

	function isWorkspaceModel(model: Monaco.editor.ITextModel): boolean {
		return model.uri.scheme === WORKSPACE_SCHEME && model.uri.authority === workspaceId;
	}

	function getWorkspaceModels(monaco: typeof Monaco): Monaco.editor.ITextModel[] {
		return monaco.editor.getModels().filter(isWorkspaceModel);
	}

	function getWorkspaceModel(monaco: typeof Monaco, bufferId: string): Monaco.editor.ITextModel | null {
		return getWorkspaceModels(monaco).find((model) => model.uri.path === `/${bufferId}`) ?? null;
	}

	function bufferIdFromPath(path: string): string {
		return path.startsWith('/') ? path.slice(1) : path;
	}

	function bufferIdFromModel(model: Monaco.editor.ITextModel): string {
		return bufferIdFromPath(model.uri.path);
	}

	function ensureWorkspaceModel(monaco: typeof Monaco, buffer: ShaderBuffer): Monaco.editor.ITextModel {
		const uri = workspaceModelUri(monaco, buffer.id);
		return monaco.editor.getModel(uri) ?? monaco.editor.createModel(buffer.code, 'glsl', uri);
	}

	function refreshDynamicTokens(monaco: typeof Monaco) {
		const models = getWorkspaceModels(monaco);
		const sig = models
			.map((model) => analyzeDocument(model.getValue()))
			.map((doc) => `${doc.structs.map((s) => s.name).join(',')}|${doc.variables.filter((v) => v.qualifier === 'uniform').map((v) => v.name).join(',')}`)
			.join('||');
		if (sig === _lastTokenSig) return;
		_lastTokenSig = sig;
		const structNames: string[] = [];
		const uniformNames: string[] = [];
		for (const model of models) {
			const doc = analyzeDocument(model.getValue());
			for (const struct of doc.structs) {
				if (!structNames.includes(struct.name)) structNames.push(struct.name);
			}
			for (const variable of doc.variables) {
				if (variable.qualifier === 'uniform' && !uniformNames.includes(variable.name)) {
					uniformNames.push(variable.name);
				}
			}
		}
		monaco.languages.setMonarchTokensProvider('glsl', buildLanguage(structNames, uniformNames));
	}

	function refreshWorkspaceHints(monaco: typeof Monaco): void {
		for (const model of getWorkspaceModels(monaco)) {
			applyHints(monaco, model);
		}
	}

	function syncWorkspaceModels(monaco: typeof Monaco): void {
		const nextWorkspaceBuffers = buffers;
		const nextIds = nextWorkspaceBuffers.map((buffer) => buffer.id);

		for (const model of getWorkspaceModels(monaco)) {
			const bufferId = bufferIdFromModel(model);
			if (!nextIds.includes(bufferId)) {
				model.dispose();
			}
		}

		for (const buffer of nextWorkspaceBuffers) {
			const model = ensureWorkspaceModel(monaco, buffer);
			if (buffer.id === activeBufferId) {
				if (model.getValue() !== value) {
					model.setValue(value);
				}
			} else if (model.getValue() !== buffer.code) {
				model.setValue(buffer.code);
			}
		}

		const activeModel = getWorkspaceModel(monaco, activeBufferId);
		if (editor && activeModel && editor.getModel() !== activeModel) {
			editor.setModel(activeModel);
		}

		if (activeModel) {
			refreshDynamicTokens(monaco);
			refreshWorkspaceHints(monaco);
		}
	}

	// Editor lifecycle

	$effect(() => {
		if (!editorContainer) return;
		let cancelled = false;
		let editorOpener: Monaco.IDisposable | undefined;
		let gotoPositionCommand: Monaco.IDisposable | undefined;

		(async () => {
			const monaco = await import('monaco-editor');
			if (cancelled || !editorContainer) return;
			workspaceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

			// Register language + theme once
			if (!monaco.languages.getLanguages().find((l) => l.id === 'glsl')) {
				monaco.languages.register({ id: 'glsl' });
			}
			monaco.languages.setMonarchTokensProvider('glsl', buildLanguage([], []));
			for (const buffer of buffers) {
				ensureWorkspaceModel(monaco, buffer);
			}
			const initialModel = getWorkspaceModel(monaco, activeBufferId) ?? getWorkspaceModels(monaco)[0] ?? null;
			if (initialModel && initialModel.getValue() !== value && bufferIdFromModel(initialModel) === activeBufferId) {
				initialModel.setValue(value);
			}
			if (initialModel) {
				refreshDynamicTokens(monaco);
			}
			monaco.languages.setLanguageConfiguration('glsl', conf);

			const EditorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
			self.MonacoEnvironment = { getWorker: () => new EditorWorker.default() };

			registerMaterialDarkerTheme(monaco);
			registerGlslProviders(monaco);

			const instance = monaco.editor.create(editorContainer, {
				model: initialModel ?? undefined,
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
			editorOpener = monaco.editor.registerEditorOpener({
				openCodeEditor(source, resource, selectionOrPosition) {
					if (source !== instance) return false;
					if (resource.scheme !== WORKSPACE_SCHEME || resource.authority !== workspaceId) return false;
					const targetModel = monaco.editor.getModel(resource);
					if (!targetModel) return false;
					onBufferFocus?.(bufferIdFromPath(resource.path));

					instance.setModel(targetModel);
					instance.focus();

					if (selectionOrPosition) {
						if ('startLineNumber' in selectionOrPosition) {
							instance.setSelection(selectionOrPosition);
							instance.revealRangeInCenter(selectionOrPosition);
						} else {
							instance.setPosition(selectionOrPosition);
							instance.revealPositionInCenter(selectionOrPosition);
						}
					}

					globals[ACTIVE_EDITOR_KEY] = instance;
					return true;
				},
			});
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
				const model = instance.getModel();
				if (!model) return;
				value = model.getValue();
				refreshDynamicTokens(monaco);
				refreshWorkspaceHints(monaco);
			});

			if (onRun) {
				instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
			}

			// Initial error markers + hints
			const model = instance.getModel();
			if (model) {
				applyErrors(monaco, model, errors);
				refreshWorkspaceHints(monaco);
			}

			monacoRef = monaco;
			editor = instance;
		})();

		return () => {
			const globals = globalThis as Record<string, unknown>;
			const currentEditor = editor;
			cancelled = true;
			currentEditor?.dispose();
			for (const model of monacoRef ? getWorkspaceModels(monacoRef) : []) {
				model.dispose();
			}
			if (globals[ACTIVE_EDITOR_KEY] === currentEditor) {
				delete globals[ACTIVE_EDITOR_KEY];
			}
			editorOpener?.dispose();
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
		const m = monacoRef;
		const model = editor.getModel();
		if (!m || !model) return;
		const activeModel = getWorkspaceModel(m, activeBufferId);
		if (!activeModel) return;
		if (editor.getModel() !== activeModel) {
			editor.setModel(activeModel);
		}
		if (activeModel.getValue() === incoming) return;
		_settingExternal = true;
		activeModel.setValue(incoming);
		_settingExternal = false;
		// Re-apply hints for the new content (marker owners survive setValue)
		refreshDynamicTokens(m);
		refreshWorkspaceHints(m);
	});

	$effect(() => {
		const m = monacoRef;
		if (!m || !editor) return;
		syncWorkspaceModels(m);
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
