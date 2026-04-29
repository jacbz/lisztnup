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
