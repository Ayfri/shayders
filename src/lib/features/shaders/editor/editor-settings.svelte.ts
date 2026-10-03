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
	hoverEnabled: true,
	inlayHints: 'on',
	parameterHints: true,
	quickSuggestions: true,
	showSnippets: true,
	showWords: true,
} satisfies EditorSettingsData;

const STORAGE_KEY = 'shayders:editorSettings';

export function loadSettings(): EditorSettingsData {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...EDITOR_DEFAULTS };
		return { ...EDITOR_DEFAULTS, ...JSON.parse(raw) };
	} catch {
		return { ...EDITOR_DEFAULTS };
	}
}

export function saveSettings(s: EditorSettingsData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {}
}

export function settingsToMonaco(s: EditorSettingsData) {
	return {
		// Appearance
		fontFamily: s.fontFamily,
		fontSize: s.fontSize,
		lineHeight: s.lineHeight,
		bufferPreviews: s.bufferPreviews,
		// Display
		bracketPairColorization: { enabled: s.bracketPairColorization },
		folding: s.folding,
		foldingStrategy: s.foldingStrategy,
		matchBrackets: s.matchBrackets,
		minimap: { enabled: s.minimapEnabled, maxColumn: 80, scale: 2, size: s.minimapSize },
		renderLineHighlight: s.renderLineHighlight,
		rulers: [] as number[],
		wordWrap: s.wordWrap,
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
		hover: { enabled: s.hoverEnabled },
		inlayHints: { enabled: s.inlayHints },
		parameterHints: { enabled: s.parameterHints },
		quickSuggestions: s.quickSuggestions ? { comments: false, other: true, strings: false } : false,
		suggest: { showSnippets: s.showSnippets, showWords: s.showWords },
	};
}
