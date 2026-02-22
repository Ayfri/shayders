import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
import { BUILTIN_DOCS } from '$lib/glsl/builtins';
import { TYPE_DOCS, GLSL_TYPES, getSwizzles } from '$lib/glsl/types';
import { GLSL_KEYWORDS, GLSL_PREPROCESSOR } from '$lib/glsl/keywords';
import { analyzeDocument, resolveType } from '$lib/glsl/analyze';

let registered = false;

export function registerGlslProviders(monaco: typeof Monaco): void {
	if (registered) return;
	registered = true;

	registerCompletion(monaco);
	registerHover(monaco);
	registerSignatureHelp(monaco);
	registerInlayHints(monaco);
}

// Keywords that look like function calls but are not
const NON_FUNCTION_KEYWORDS = new Set([
	'if', 'else', 'for', 'while', 'do', 'switch', 'return',
	'discard', 'break', 'continue', 'struct',
]);

// Extract parameter names from the first overload of a BUILTIN_DOCS signature string
function extractParamNames(signature: string): string[] {
	const inner = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
	if (!inner.trim()) return [];
	return inner.split(',').map((p) => {
		const parts = p.trim().split(/\s+/);
		return parts[parts.length - 1].replace(/[^a-zA-Z0-9_]/g, '');
	}).filter(Boolean);
}

// Completion range: start = word start, end = end of full word at position (for mid-word replace)
function completionRange(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	position: Monaco.Position,
): Monaco.IRange {
	const wordUntil = model.getWordUntilPosition(position);
	const wordAt    = model.getWordAtPosition(position);
	return {
		startLineNumber: position.lineNumber,
		endLineNumber:   position.lineNumber,
		startColumn:     wordUntil.startColumn,
		endColumn:       wordAt?.endColumn ?? position.column,
	};
}

function registerCompletion(monaco: typeof Monaco) {
	monaco.languages.registerCompletionItemProvider('glsl', {
		triggerCharacters: ['.', '#'],

		provideCompletionItems(model, position, context) {
			const CIK  = monaco.languages.CompletionItemKind;
			const CITR = monaco.languages.CompletionItemInsertTextRule;

			// Swizzle completions after a dot
			if (context.triggerCharacter === '.') {
				const lineText   = model.getLineContent(position.lineNumber);
				const before     = lineText.slice(0, position.column - 2);
				const wordBefore = before.match(/(\w+)\s*$/)?.[1];
				if (!wordBefore) return { suggestions: [] };

				const doc  = analyzeDocument(model.getValue());
				const type = resolveType(doc, wordBefore)
					?? (BUILTIN_DOCS[wordBefore]?.signature.match(/^(\w+)/)?.[1]);
				if (!type) return { suggestions: [] };

				const swizzles = getSwizzles(type);
				if (swizzles.length === 0) return { suggestions: [] };

				const range: Monaco.IRange = {
					startLineNumber: position.lineNumber,
					endLineNumber:   position.lineNumber,
					startColumn:     position.column,
					endColumn:       position.column,
				};

				return {
					suggestions: swizzles.map((sw, i) => ({
						label:      sw,
						kind:       CIK.Field,
						insertText: sw,
						sortText:   String(i).padStart(6, '0'),
						detail:     `${type}.${sw} → ${swizzleResultType(type, sw)}`,
						range,
					})),
				};
			}

			// Preprocessor completions after #
			if (context.triggerCharacter === '#') {
				const word = model.getWordUntilPosition(position);
				const range: Monaco.IRange = {
					startLineNumber: position.lineNumber,
					endLineNumber:   position.lineNumber,
					startColumn:     word.startColumn - 1, // include '#'
					endColumn:       word.endColumn,
				};
				return {
					suggestions: GLSL_PREPROCESSOR.map((pp) => ({
						label:      pp,
						kind:       CIK.Keyword,
						insertText: pp.slice(1),
						range,
					})),
				};
			}

			// General completions - range spans the full word so mid-word replace works
			const range = completionRange(monaco, model, position);
			const suggestions: Monaco.languages.CompletionItem[] = [];

			for (const t of GLSL_TYPES) {
				const td = TYPE_DOCS[t];
				suggestions.push({
					label:         t,
					kind:          CIK.TypeParameter,
					insertText:    t,
					detail:        td?.description ?? '',
					documentation: td?.struct ? { value: `\`\`\`glsl\n${td.struct}\n\`\`\`` } : undefined,
					range,
				});
			}

			for (const kw of GLSL_KEYWORDS) {
				suggestions.push({ label: kw, kind: CIK.Keyword, insertText: kw, range });
			}

			for (const [name, doc] of Object.entries(BUILTIN_DOCS)) {
				const isVar = name.startsWith('gl_');
				suggestions.push({
					label:           name,
					kind:            isVar ? CIK.Variable : CIK.Function,
					insertText:      isVar ? name : `${name}($0)`,
					insertTextRules: isVar ? undefined : CITR.InsertAsSnippet,
					detail:          doc.signature.split('\n')[0],
					documentation:   { value: doc.description },
					range,
				});
			}

			const docInfo = analyzeDocument(model.getValue());

			for (const v of docInfo.variables) {
				if (BUILTIN_DOCS[v.name] || GLSL_TYPES.includes(v.name)) continue;
				suggestions.push({
					label:         v.name,
					kind:          v.qualifier === 'uniform'   ? CIK.Constant
					             : v.qualifier === 'attribute' ? CIK.Field
					             : CIK.Variable,
					insertText:    v.name,
					detail:        [v.qualifier, v.type].filter(Boolean).join(' '),
					documentation: { value: `**${v.qualifier ?? 'variable'}** \`${v.type} ${v.name}\`  \nDeclared at line ${v.line}` },
					range,
				});
			}

			for (const fn of docInfo.functions) {
				if (BUILTIN_DOCS[fn.name]) continue;
				const paramList = fn.params.map((p) => `${p.type} ${p.name}`).join(', ');
				suggestions.push({
					label:           fn.name,
					kind:            CIK.Function,
					insertText:      `${fn.name}($0)`,
					insertTextRules: CITR.InsertAsSnippet,
					detail:          `${fn.returnType} ${fn.name}(${paramList})`,
					documentation:   { value: `User-defined function at line ${fn.line}` },
					range,
				});
			}

			for (const def of docInfo.defines) {
				suggestions.push({
					label:         def.name,
					kind:          CIK.Constant,
					insertText:    def.name,
					detail:        `#define ${def.name} ${def.value}`,
					documentation: { value: `Preprocessor macro at line ${def.line}` },
					range,
				});
			}

			return { suggestions };
		},
	});
}

function registerHover(monaco: typeof Monaco) {
	monaco.languages.registerHoverProvider('glsl', {
		provideHover(model, position): Monaco.languages.Hover | null {
			const word = model.getWordAtPosition(position);
			if (!word) return null;

			const name = word.word;
			const range: Monaco.IRange = {
				startLineNumber: position.lineNumber,
				endLineNumber:   position.lineNumber,
				startColumn:     word.startColumn,
				endColumn:       word.endColumn,
			};

			// Built-in function or variable
			const builtin = BUILTIN_DOCS[name];
			if (builtin) {
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n${builtin.signature}\n\`\`\``, isTrusted: true },
						{ value: builtin.description, isTrusted: true },
					],
				};
			}

			// GLSL type
			const typeDoc = TYPE_DOCS[name];
			if (typeDoc) {
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n${typeDoc.struct}\n\`\`\``, isTrusted: true },
						{ value: typeDoc.description, isTrusted: true },
					],
				};
			}

			// User-defined symbols
			const doc = analyzeDocument(model.getValue());

			const fn = doc.functions.find((f) => f.name === name);
			if (fn) {
				const params = fn.params
					.map((p) => `${p.qualifier && p.qualifier !== 'in' ? p.qualifier + ' ' : ''}${p.type} ${p.name}`)
					.join(', ');
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n${fn.returnType} ${fn.name}(${params})\n\`\`\``, isTrusted: true },
						{ value: `User-defined function at line ${fn.line}.`, isTrusted: true },
					],
				};
			}

			const variable = doc.variables.find((v) => v.name === name);
			if (variable) {
				const qualifier = variable.qualifier ? `${variable.qualifier} ` : '';
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n${qualifier}${variable.type} ${variable.name}\n\`\`\``, isTrusted: true },
						{ value: `Declared at line ${variable.line}.`, isTrusted: true },
					],
				};
			}

			const def = doc.defines.find((d) => d.name === name);
			if (def) {
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n#define ${def.name} ${def.value}\n\`\`\``, isTrusted: true },
						{ value: `Preprocessor macro at line ${def.line}.`, isTrusted: true },
					],
				};
			}

			return null;
		},
	});
}

function registerSignatureHelp(monaco: typeof Monaco) {
	monaco.languages.registerSignatureHelpProvider('glsl', {
		signatureHelpTriggerCharacters: ['(', ','],

		provideSignatureHelp(model, position) {
			const lineContent = model.getLineContent(position.lineNumber);
			const col         = position.column - 1;
			let depth      = 0;
			let commaCount = 0;
			let fnStart    = -1;

			for (let i = col - 1; i >= 0; i--) {
				const ch = lineContent[i];
				if (ch === ')') { depth++;   continue; }
				if (ch === '(') {
					if (depth > 0) { depth--; continue; }
					commaCount = (lineContent.slice(i + 1, col).match(/,/g) ?? []).length;
					fnStart    = i;
					break;
				}
			}

			if (fnStart < 0) return null;

			const wordBefore = model.getWordAtPosition({
				lineNumber: position.lineNumber,
				column:     fnStart,
			});
			if (!wordBefore) return null;

			let sigSource: { signature: string; description: string } | null =
				BUILTIN_DOCS[wordBefore.word] ?? null;

			if (!sigSource) {
				const doc = analyzeDocument(model.getValue());
				const fn  = doc.functions.find((f) => f.name === wordBefore.word);
				if (fn) {
					const paramList = fn.params
						.map((p) => `${p.qualifier && p.qualifier !== 'in' ? p.qualifier + ' ' : ''}${p.type} ${p.name}`)
						.join(', ');
					sigSource = {
						signature:   `${fn.returnType} ${fn.name}(${paramList})`,
						description: `User-defined at line ${fn.line}`,
					};
				}
			}

			if (!sigSource) return null;

			const overloads   = sigSource.signature.split('\n');
			const signatures: Monaco.languages.SignatureInformation[] = overloads.map((sig) => {
				const inner  = sig.slice(sig.indexOf('(') + 1, sig.lastIndexOf(')'));
				const params = inner.split(',').map((p) => p.trim()).filter(Boolean).map((p) => ({ label: p }));
				return {
					label:         sig,
					documentation: { value: sigSource!.description },
					parameters:    params,
				};
			});

			return {
				value: {
					signatures,
					activeSignature: 0,
					activeParameter: Math.min(
						commaCount,
						(signatures[0]?.parameters.length ?? 1) - 1,
					),
				},
				dispose: () => {},
			};
		},
	});
}

// Vector constructor types that get component-labelled inlay hints
const CONSTRUCTOR_TYPES = new Set([
	'vec2', 'vec3', 'vec4',
	'ivec2', 'ivec3', 'ivec4',
	'uvec2', 'uvec3', 'uvec4',
	'bvec2', 'bvec3', 'bvec4',
]);

/** Returns the xyzw component names for a vector constructor type, e.g. vec3 → ['x','y','z'] */
function constructorComponents(typeName: string): string[] {
	const doc = TYPE_DOCS[typeName];
	if (!doc?.components) return [];
	return doc.components.map((c) => c[0]); // use xyzw aliases (index 0)
}

/**
 * Estimates how many constructor component slots an argument expression fills.
 * - Trailing swizzle (e.g. `a.xy`)  → swizzle length
 * - Simple identifier with resolved vector type → vector size
 * - Otherwise → 1 (scalar / unknown)
 */
function argComponentCount(
	arg: string,
	docInfo: ReturnType<typeof analyzeDocument>,
): number {
	const trimmed = arg.trim();
	// Trailing swizzle: word.xyzw / word.rgba / word.stpq
	const swizzleMatch = trimmed.match(/\.([xyzwrgbastpq]+)$/);
	if (swizzleMatch) return swizzleMatch[1].length;

	// Simple identifier — try to resolve its type
	const identMatch = trimmed.match(/^([a-zA-Z_]\w*)$/);
	if (identMatch) {
		const varType = resolveType(docInfo, identMatch[1]);
		if (varType) {
			const vecMatch = varType.match(/(?:vec|ivec|uvec|bvec)(\d)/);
			if (vecMatch) return parseInt(vecMatch[1], 10);
		}
	}

	return 1;
}

function registerInlayHints(monaco: typeof Monaco) {
	monaco.languages.registerInlayHintsProvider('glsl', {
		provideInlayHints(model): Monaco.languages.InlayHintList {
			const hints   = [] as Monaco.languages.InlayHint[];
			const docInfo = analyzeDocument(model.getValue());

			// Build function → param names map (non-constructor builtins + user functions)
			const fnParams = new Map<string, string[]>();

			for (const [name, info] of Object.entries(BUILTIN_DOCS)) {
				const names = extractParamNames(info.signature.split('\n')[0]);
				if (names.length > 0) fnParams.set(name, names);
			}
			for (const fn of docInfo.functions) {
				fnParams.set(fn.name, fn.params.map((p) => p.name));
			}

			const lineCount = model.getLineCount();

			for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
				const line    = model.getLineContent(lineNum);
				const trimmed = line.trimStart();

				// Skip comment and preprocessor lines
				if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('#')) continue;

				// Strip inline comments to avoid false positives
				const stripped = line
					.replace(/\/\/.*$/, '')
					.replace(/\/\*.*?\*\//g, (m) => ' '.repeat(m.length));

				const callRe = /\b([a-zA-Z_]\w*)\s*\(/g;
				let m: RegExpExecArray | null;

				while ((m = callRe.exec(stripped)) !== null) {
					const fnName = m[1];
					if (NON_FUNCTION_KEYWORDS.has(fnName)) continue;

					const openParenIdx = m.index + m[0].length;

					// Constructor hint (vec2/vec3/vec4/ivec…/uvec…/bvec…)
					if (CONSTRUCTOR_TYPES.has(fnName)) {
						const components = constructorComponents(fnName);
						if (components.length === 0) continue;

						let slotIdx      = 0;   // next component slot to fill
						let argBuf       = '';   // accumulated text of current arg
						let argFirstCol  = -1;   // 0-based column of first non-space char
						let depth        = 1;

						const flushArg = (hintCol: number, buf: string) => {
							if (hintCol < 0 || slotIdx >= components.length) return;
							const count = argComponentCount(buf, docInfo);
							const label = components.slice(slotIdx, slotIdx + count).join('');
							slotIdx += count;
							// Suppress redundant "x: x" hints
							if (label && buf.trim() !== label) {
								hints.push({
									kind:         monaco.languages.InlayHintKind.Parameter,
									position:     { lineNumber: lineNum, column: hintCol + 1 },
									label:        `${label}:`,
									paddingRight: true,
								});
							}
						};

						for (let col = openParenIdx; col < stripped.length && depth > 0; col++) {
							const ch = stripped[col];

							if (ch === '(') { depth++; argBuf += ch; continue; }

							if (ch === ')') {
								depth--;
								if (depth === 0) { flushArg(argFirstCol, argBuf); break; }
								argBuf += ch;
								continue;
							}

							if (ch === ',' && depth === 1) {
								flushArg(argFirstCol, argBuf);
								argBuf      = '';
								argFirstCol = -1;
								continue;
							}

							argBuf += ch;
							if (argFirstCol === -1 && ch !== ' ' && ch !== '\t') {
								argFirstCol = col;
							}
						}

						continue; // handled as constructor — skip regular-param path
					}

					// Regular function / builtin hint
					const params = fnParams.get(fnName);
					if (!params || params.length === 0) continue;

					let depth        = 1;
					let argIndex     = 0;
					let needArgStart = true;

					for (let col = openParenIdx; col < stripped.length && depth > 0; col++) {
						const ch = stripped[col];

						if (ch === '(') { depth++; continue; }
						if (ch === ')') { depth--; continue; }

						if (ch === ',' && depth === 1) {
							argIndex++;
							needArgStart = true;
							continue;
						}

						if (needArgStart && depth === 1 && ch !== ' ' && ch !== '\t') {
							needArgStart = false;
							if (argIndex < params.length) {
								const paramName = params[argIndex];
								const argToken  = stripped.slice(col).match(/^\w+/)?.[0];
								if (argToken !== paramName) {
									hints.push({
										kind:         monaco.languages.InlayHintKind.Parameter,
										position:     { lineNumber: lineNum, column: col + 1 },
										label:        `${paramName}:`,
										paddingRight: true,
									});
								}
							}
						}
					}
				}
			}

			return { hints, dispose: () => {} };
		},
	});
}

// Returns the swizzle result type given a source type and swizzle string
function swizzleResultType(sourceType: string, swizzle: string): string {
	if (swizzle.length === 1) {
		if (sourceType.startsWith('i')) return 'int';
		if (sourceType.startsWith('u')) return 'uint';
		if (sourceType.startsWith('b')) return 'bool';
		return 'float';
	}
	const n = swizzle.length;
	if (sourceType.startsWith('ivec')) return `ivec${n}`;
	if (sourceType.startsWith('uvec')) return `uvec${n}`;
	if (sourceType.startsWith('bvec')) return `bvec${n}`;
	return `vec${n}`;
}
