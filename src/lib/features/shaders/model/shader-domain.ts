export const BUFFER_UNIFORM_NAMES = [
	'uBufferA',
	'uBufferB',
	'uBufferC',
	'uBufferD',
	'uBufferE',
	'uBufferF',
	'uBufferG',
	'uBufferH',
] as const;

export const CHANNEL_UNIFORM_NAMES = ['uChannel0', 'uChannel1', 'uChannel2', 'uChannel3'] as const;

export const FULLSCREEN_TOGGLE_KEY = 'f' as const;

/** Longest side of a buffer preview in pixels, the other side follows the canvas aspect ratio. */
export const THUMB_MAX_SIZE = 128;
