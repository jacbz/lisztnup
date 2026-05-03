export async function sendTelegramMessage(token: string, chatId: string, html: string) {
	try {
		await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text: html,
				parse_mode: 'HTML'
			})
		});
	} catch (e) {
		console.error('Telegram notification failed:', e);
	}
}

function esc(s: string) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type GameSessionRow = {
	id: string | null;
	started: string | null;
	updated: string | null;
	state: string | null;
	mode: string | null;
	tracklist_id: string | null;
	country: string | null;
	locale: string | null;
	user_hash: string | null;
	game_info: string | null;
};

function formatSessionValue(value: unknown) {
	if (value === null || value === undefined || value === '') return 'n/a';
	return String(value);
}

export function formatSessionBlock(session: GameSessionRow) {
	let gameInfo = formatSessionValue(session.game_info);
	if (session.game_info) {
		try {
			const parsed = JSON.parse(session.game_info);
			gameInfo = JSON.stringify(parsed, null, 2);
		} catch {
			gameInfo = session.game_info;
		}
	}

	const lines = [
		`<b>Session ID:</b> ${esc(formatSessionValue(session.id))}`,
		`<b>Started:</b> ${esc(formatSessionValue(session.started))}`,
		`<b>Updated:</b> ${esc(formatSessionValue(session.updated))}`,
		`<b>State:</b> ${esc(formatSessionValue(session.state))}`,
		`<b>Mode:</b> ${esc(formatSessionValue(session.mode))}`,
		`<b>Tracklist:</b> ${esc(formatSessionValue(session.tracklist_id))}`,
		`<b>Country:</b> ${esc(formatSessionValue(session.country))}`,
		`<b>Locale:</b> ${esc(formatSessionValue(session.locale))}`,
		`<b>User hash:</b> ${esc(formatSessionValue(session.user_hash))}`,
		`<b>Game info:</b> <pre>${esc(formatSessionValue(gameInfo))}</pre>`
	];

	return `<blockquote expandable>${lines.join('\n')}</blockquote>`;
}

export function formatFeedbackMessage(message: string, country: string, email?: string) {
	let text = `💬 <b>New Feedback</b>\n\n`;
	text += `<b>Message:</b> ${esc(message)}\n`;
	if (email) text += `<b>Email:</b> ${esc(email)}\n`;
	text += `<b>Country:</b> ${esc(country)}`;
	return text;
}

export function formatReportMessage(
	message: string,
	composer: string,
	work: string,
	part: string,
	deezerId: string,
	country: string,
	email?: string
) {
	let text = `🚩 <b>Problem Report</b>\n\n`;
	text += `<b>Composer:</b> ${esc(composer)}\n`;
	text += `<b>Work:</b> ${esc(work)}\n`;
	text += `<b>Part:</b> ${esc(part)}\n`;
	text += `<b>Deezer:</b> ${esc(deezerId)}\n`;
	text += `<b>Message:</b> ${esc(message)}\n`;
	if (email) text += `<b>Email:</b> ${esc(email)}\n`;
	text += `<b>Country:</b> ${esc(country)}`;
	return text;
}
