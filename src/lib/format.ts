const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

/** @example formatDate('2026-03-26 02:18:29.920Z') === 'Mar 26, 2026' */
export function formatDate(date: string): string {
	return DATE_FORMAT.format(new Date(date.replace(' ', 'T')));
}

/** @example plural(3, 'shader') === '3 shaders' */
export function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function formatUserHandle(username: string, fallbackId: string): string {
	return username ? `@${username}` : fallbackId;
}
