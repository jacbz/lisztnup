export async function hashUser(ip: string, salt: string) {
	const msgUint8 = new TextEncoder().encode(ip + salt);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

export function getCurrentSalt() {
	return new Date().toISOString().split('T')[0];
}
