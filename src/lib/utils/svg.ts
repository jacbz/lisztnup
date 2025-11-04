/**
 * Extracts the path data from an SVG string
 * @param svgString - The SVG string to extract from
 * @returns The path data string, or empty string if not found
 */
export function extractPathFromSVG(svgString: string): string {
	const pathMatch = svgString.match(/<path[^>]*d="([^"]*)"/);
	return pathMatch && pathMatch[1] ? pathMatch[1] : '';
}

/**
 * Extracts the entire SVG content (without the outer <svg> tags)
 * @param svgString - The SVG string to extract from
 * @returns The inner SVG content
 */
export function extractSVGContent(svgString: string): string {
	const contentMatch = svgString.match(/<svg[^>]*>(.*?)<\/svg>/s);
	return contentMatch && contentMatch[1] ? contentMatch[1].trim() : '';
}
