import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';

export function registerMaterialDarkerTheme(monaco: typeof Monaco) {
	monaco.editor.defineTheme('material-darker', {
		base: 'vs-dark',
		inherit: false,
		colors: {
			// Editor background and text
			'editor.background':                   '#212121',
			'editor.foreground':                   '#EEFFFF',
			'editorLineNumber.foreground':         '#424242',
			'editorLineNumber.activeForeground':   '#616161',
			'editorCursor.foreground':             '#FFCC00',
			'editor.lineHighlightBackground':      '#181818',
			'editor.lineHighlightBorder':          '#00000000',
			// Selection
			'editor.selectionBackground':          '#353535',
			'editor.inactiveSelectionBackground':  '#29292980',
			'editor.wordHighlightBackground':      '#35353580',
			'editor.wordHighlightBorder':          '#89DDFF40',
			'editor.findMatchBackground':          '#FFCC0040',
			'editor.findMatchHighlightBackground': '#FFCC0025',
			// Gutter
			'editorGutter.background':             '#212121',
			// Indent guides
			'editorIndentGuide.background1':       '#424242',
			'editorIndentGuide.activeBackground1': '#FF9800',
			// Bracket matching
			'editorBracketMatch.background':       '#89DDFF20',
			'editorBracketMatch.border':           '#89DDFF',
			// Scrollbar
			'scrollbar.shadow':                    '#00000000',
			'scrollbarSlider.background':          '#61616180',
			'scrollbarSlider.hoverBackground':     '#616161C0',
			'scrollbarSlider.activeBackground':    '#616161',
			// Widgets
			'editorWidget.background':             '#292929',
			'editorSuggestWidget.background':      '#292929',
			'editorSuggestWidget.border':          '#424242',
			'editorSuggestWidget.selectedBackground': '#353535',
			// Minimap
			'minimap.background':                  '#1A1A1A',
		},
		rules: [
			// Base text
			{ token: '',                        foreground: 'EEFFFF' },
			{ token: 'identifier',              foreground: 'EEFFFF' },
			// Comments
			{ token: 'comment',                 foreground: '616161', fontStyle: 'italic' },
			{ token: 'comment.line',            foreground: '616161', fontStyle: 'italic' },
			{ token: 'comment.block',           foreground: '616161', fontStyle: 'italic' },
			// Keywords
			{ token: 'keyword',                 foreground: 'C792EA', fontStyle: 'italic' },
			{ token: 'keyword.control',         foreground: 'C792EA', fontStyle: 'italic' },
			{ token: 'keyword.cpp',             foreground: 'C792EA', fontStyle: 'italic' },
			// Types
			{ token: 'keyword.type',            foreground: 'FFCB6B' },
			{ token: 'type',                    foreground: 'FFCB6B' },
			{ token: 'type.identifier',         foreground: 'FFCB6B' },
			{ token: 'storage.type',            foreground: 'FFCB6B' },
			{ token: 'storage.modifier',        foreground: 'C792EA', fontStyle: 'italic' },
			// Functions
			{ token: 'identifier.function',     foreground: '82AAFF' },
			{ token: 'function',                foreground: '82AAFF' },
			{ token: 'support.function',        foreground: '82AAFF' },
			{ token: 'entity.name.function',    foreground: '82AAFF' },
			{ token: 'storage.type.function',   foreground: '82AAFF' },
			// Uniforms
			{ token: 'variable.uniform',        foreground: 'FF7B7B' },
			// Predefined symbols (gl_Position, gl_FragColor...)
			{ token: 'variable.predefined',     foreground: '82AAFF', fontStyle: 'italic' },
			{ token: 'predefined',              foreground: '82AAFF', fontStyle: 'italic' },
			// Parameters
			{ token: 'variable.parameter',      foreground: 'F78C6C' },
			// Constants
			{ token: 'constant',                foreground: 'F78C6C' },
			{ token: 'constant.numeric',        foreground: 'F78C6C' },
			{ token: 'constant.language',       foreground: 'FF5370' },
			// Numbers
			{ token: 'number',                  foreground: 'F78C6C' },
			{ token: 'number.float',            foreground: 'F78C6C' },
			{ token: 'number.hex',              foreground: 'F78C6C' },
			// Strings
			{ token: 'string',                  foreground: 'C3E88D' },
			{ token: 'string.quoted',           foreground: 'C3E88D' },
			// Operators
			{ token: 'operator',                foreground: '89DDFF' },
			// Delimiters
			{ token: 'delimiter',               foreground: '89DDFF' },
			{ token: 'delimiter.parenthesis',   foreground: '89DDFF' },
			{ token: 'delimiter.bracket',       foreground: '89DDFF' },
			{ token: 'delimiter.curly',         foreground: '89DDFF' },
			{ token: 'delimiter.square',        foreground: '89DDFF' },
			// Tags
			{ token: 'tag',                     foreground: 'F07178' },
			// Attributes
			{ token: 'attribute.name',          foreground: 'FFCB6B', fontStyle: 'italic' },
			{ token: 'attribute.value',         foreground: 'C3E88D' },
			// Preprocessor/macro directives
			{ token: 'meta.preprocessor',         foreground: 'C792EA', fontStyle: 'italic' },
			{ token: 'meta.preprocessor.keyword', foreground: 'C792EA', fontStyle: 'italic' },
			// Annotations
			{ token: 'annotation',              foreground: 'C792EA' },
			{ token: 'metatag',                 foreground: '89DDFF' },
			// String escapes
			{ token: 'string.escape.invalid',   foreground: 'FF5370' },
			{ token: 'string.escape',           foreground: '89DDFF' },
		],
	});
}
