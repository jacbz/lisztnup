// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const __BUILD_DATE__: string;
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				TELEGRAM_BOT_TOKEN: string;
				TELEGRAM_CHAT_ID: string;
			};
			context: {
				waitUntil(promise: Promise<unknown>): void;
			};
			cf: CfProperties;
		}
	}
}

export {};
