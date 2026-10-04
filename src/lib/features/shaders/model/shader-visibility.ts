import { Globe, Link, Lock, type LucideIcon } from '@lucide/svelte';
import type { ShadersVisiblityOptions } from '#lib/pocketbase-types.js';

export type ShaderVisibility = keyof typeof ShadersVisiblityOptions;

interface VisibilityOption {
	/** Badge colors on profile cards. */
	badgeClass: string;
	description: string;
	icon: LucideIcon;
	label: string;
	value: ShaderVisibility;
}

export const VISIBILITY_OPTIONS = [
	{ badgeClass: 'border-green-900/50 bg-green-950/30 text-green-400', description: 'Visible to everyone in profiles', icon: Globe, label: 'Public', value: 'public' },
	{ badgeClass: 'border-yellow-900/50 bg-yellow-950/30 text-yellow-400', description: 'Accessible by URL, hidden from profiles', icon: Link, label: 'Unlisted', value: 'unlisted' },
	{ badgeClass: 'border-red-900/50 bg-red-950/30 text-red-400', description: 'Only accessible to you', icon: Lock, label: 'Private', value: 'private' },
] as const satisfies readonly VisibilityOption[];

export function getVisibilityOption(value: ShaderVisibility): VisibilityOption {
	return VISIBILITY_OPTIONS.find((option) => option.value === value) ?? VISIBILITY_OPTIONS[0];
}
