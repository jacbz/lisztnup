import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__BUILD_DATE__: JSON.stringify(new Date().toISOString().substring(0, 10))
	},
	esbuild: mode === 'production' ? { pure: ['console.debug'] } : undefined
}));
