/**
 * Extracts the path data from an SVG string
 * @param svgString - The SVG string to extract from
 * @returns An array of path data strings
 */
export function extractPathFromSVG(svgString: string): string[] {
	const pathMatches = svgString.matchAll(/<path[^>]*d="([^"]*)"/g);
	return Array.from(pathMatches, (match) => match[1]).filter(Boolean);
}
