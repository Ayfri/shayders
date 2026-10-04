import { browser } from '$app/env';
import type { editor } from 'monaco-editor/editor';

export interface EditorSettingsData {
	// Appearance
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	// Tabs
	bufferPreviews: boolean;
	// Display
	bracketPairColorization: boolean;
	folding: boolean;
	foldingStrategy: 'auto' | 'indentation';
	matchBrackets: 'always' | 'near' | 'never';
	minimapEnabled: boolean;
	minimapSize: 'proportional' | 'fill' | 'fit';
	renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	stickyScroll: boolean;
	wordWrap: 'on' | 'off';
	// Behavior
	contextmenu: boolean;
	copyWithSyntaxHighlighting: boolean;
	cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit';
	formatOnPaste: boolean;
	mouseWheelZoom: boolean;
	scrollBeyondLastLine: boolean;
	smoothScrolling: boolean;
	// IntelliSense
	colorDecorators: boolean;
	hoverEnabled: boolean;
	inlayHints: 'on' | 'off' | 'offUnlessPressed';
	parameterHints: boolean;
	quickSuggestions: boolean;
	showSnippets: boolean;
	showWords: boolean;
}

export const EDITOR_DEFAULTS = {
	// Appearance
	fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
	fontSize: 14,
	lineHeight: 22,
	// Tabs
	bufferPreviews: true,
	// Display
	bracketPairColorization: true,
	folding: true,
	foldingStrategy: 'indentation',
	matchBrackets: 'always',
	minimapEnabled: true,
	minimapSize: 'proportional',
	renderLineHighlight: 'gutter',
	renderWhitespace: 'selection',
	stickyScroll: true,
	wordWrap: 'off',
	// Behavior
	contextmenu: true,
	copyWithSyntaxHighlighting: true,
	cursorSmoothCaretAnimation: 'on',
	formatOnPaste: true,
	mouseWheelZoom: true,
	scrollBeyondLastLine: false,
	smoothScrolling: true,
	// IntelliSense
	colorDecorators: true,
	hoverEnabled: true,
	inlayHints: 'on',
	parameterHints: true,
	quickSuggestions: true,
	showSnippets: true,
	showWords: true,
} satisfies EditorSettingsData;

const STORAGE_KEY = 'shayders:editorSettings';

function loadSettings(): EditorSettingsData {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { ...EDITOR_DEFAULTS, ...JSON.parse(raw) } : { ...EDITOR_DEFAULTS };
	} catch {
		return { ...EDITOR_DEFAULTS };
	}
}

/** Browser-local editor preferences shared by the editor, the settings modal and the canvas runtime, persisted on every change. */
export const editorSettings = $state<EditorSettingsData>(loadSettings());

if (browser) {
	$effect.root(() => {
		$effect(() => {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(editorSettings));
			} catch {
				/** Storage can be full or disabled (private mode), settings then only live for the session. */
			}
		});
	});
}

export function resetEditorSettings(): void {
	Object.assign(editorSettings, EDITOR_DEFAULTS);
}

export function settingsToMonaco(s: EditorSettingsData): editor.IEditorOptions {
	return {
		// Appearance
		fontFamily: s.fontFamily,
		fontSize: s.fontSize,
		lineHeight: s.lineHeight,
		// Display
		bracketPairColorization: { enabled: s.bracketPairColorization },
		folding: s.folding,
		foldingStrategy: s.foldingStrategy,
		matchBrackets: s.matchBrackets,
		minimap: { enabled: s.minimapEnabled, maxColumn: 80, scale: 2, size: s.minimapSize },
		guides: { bracketPairs: 'active', highlightActiveIndentation: true, indentation: true },
		renderLineHighlight: s.renderLineHighlight,
		renderWhitespace: s.renderWhitespace,
		rulers: [],
		stickyScroll: { enabled: s.stickyScroll },
		wordWrap: s.wordWrap,
		wrappingIndent: 'indent',
		wrappingStrategy: 'advanced',
		// Behavior (links and columnSelection are forced)
		columnSelection: false,
		contextmenu: s.contextmenu,
		copyWithSyntaxHighlighting: s.copyWithSyntaxHighlighting,
		cursorSmoothCaretAnimation: s.cursorSmoothCaretAnimation,
		formatOnPaste: s.formatOnPaste,
		links: true,
		mouseWheelZoom: s.mouseWheelZoom,
		scrollBeyondLastLine: s.scrollBeyondLastLine,
		smoothScrolling: s.smoothScrolling,
		// IntelliSense
		colorDecorators: s.colorDecorators,
		hover: { enabled: s.hoverEnabled ? 'on' : 'off' },
		inlayHints: { enabled: s.inlayHints },
		parameterHints: { enabled: s.parameterHints },
		quickSuggestions: s.quickSuggestions ? { comments: false, other: true, strings: false } : false,
		suggest: { showSnippets: s.showSnippets, showWords: s.showWords },
	};
}
