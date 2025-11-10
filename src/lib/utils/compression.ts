import { deflate, inflate } from 'pako';

/** Compresses a given string into a Base64-encoded string using deflate */
export const compress = (input: string) => btoa(String.fromCharCode(...Array.from(deflate(input))));

/** Decompresses a given Base64-encoded string using inflate */
export const decompress = (input: string) =>
	inflate(
		Uint8Array.from(atob(input), (c) => c.charCodeAt(0)),
		{ to: 'string' }
	);
