import { isSupportedLocale } from '$lib/seo';

export function match(param: string) {
	return isSupportedLocale(param);
}
