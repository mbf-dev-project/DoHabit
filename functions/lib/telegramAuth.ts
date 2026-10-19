/**
 * Telegram Mini App Authentication Helper
 *
 * Implements cryptographic validation of `initData` according to Telegram's official specification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 *
 * Uses the standard Web Crypto API (supported natively in Cloudflare Pages Functions).
 */

export interface TelegramUser {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	is_premium?: boolean;
	allows_write_to_pm?: boolean;
	photo_url?: string;
}

export interface TelegramAuthResult {
	isValid: boolean;
	user?: TelegramUser;
	authDate?: number;
	queryId?: string;
	error?: string;
}

const DEFAULT_MAX_AGE_SECONDS = 86_400; // 24 hours

/**
 * Constant-time string comparison to prevent timing attacks on hash verification.
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

/**
 * Validates Telegram Mini App `initData` query string.
 *
 * @param initData Raw query string received from `window.Telegram.WebApp.initData`
 * @param botToken Telegram Bot Token (server-side secret only)
 * @param maxAgeSeconds Maximum allowed age of auth_date in seconds (default: 86400 = 24h)
 */
export async function validateTelegramInitData(
	initData: string,
	botToken: string,
	maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
): Promise<TelegramAuthResult> {
	if (!initData || typeof initData !== 'string') {
		return { isValid: false, error: 'Empty or missing initData' };
	}

	if (!botToken || typeof botToken !== 'string' || botToken.trim() === '') {
		return { isValid: false, error: 'Server configuration error: TELEGRAM_BOT_TOKEN is not configured' };
	}

	try {
		const params = new URLSearchParams(initData);
		const hash = params.get('hash');

		if (!hash) {
			return { isValid: false, error: 'Missing hash parameter in initData' };
		}

		// Ensure hash is strictly 64 hexadecimal characters (SHA-256 hex output)
		if (hash.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hash)) {
			return { isValid: false, error: 'Invalid hash format: must be 64 hexadecimal characters' };
		}

		// Remove hash before building data-check-string
		params.delete('hash');

		// Check auth_date
		const authDateStr = params.get('auth_date');
		if (!authDateStr) {
			return { isValid: false, error: 'Missing auth_date in initData' };
		}

		const authDate = parseInt(authDateStr, 10);
		if (isNaN(authDate) || authDate <= 0) {
			return { isValid: false, error: 'Invalid auth_date format' };
		}

		const nowSeconds = Math.floor(Date.now() / 1000);

		if (maxAgeSeconds > 0) {
			if (nowSeconds - authDate > maxAgeSeconds) {
				return { isValid: false, error: 'initData has expired (exceeds max age)' };
			}
			// Reject tokens with timestamps significantly in the future (skew tolerance: 120s)
			if (authDate - nowSeconds > 120) {
				return { isValid: false, error: 'initData timestamp is in the future' };
			}
		}

		// Sort keys alphabetically and format as `key=value\nkey2=value2...`
		const keys = Array.from(params.keys()).sort();
		const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

		const encoder = new TextEncoder();

		// Step 1: secret_key = HMAC_SHA256("WebAppData", botToken)
		const webAppDataKey = await crypto.subtle.importKey(
			'raw',
			encoder.encode('WebAppData'),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const secretKeyBuffer = await crypto.subtle.sign(
			'HMAC',
			webAppDataKey,
			encoder.encode(botToken)
		);

		// Step 2: calculated_hash = HMAC_SHA256(secret_key, data_check_string)
		const signingKey = await crypto.subtle.importKey(
			'raw',
			secretKeyBuffer,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const calculatedSignatureBuffer = await crypto.subtle.sign(
			'HMAC',
			signingKey,
			encoder.encode(dataCheckString)
		);

		// Convert to hex string
		const calculatedHash = Array.from(new Uint8Array(calculatedSignatureBuffer))
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('');

		// Constant-time compare
		if (!timingSafeEqual(calculatedHash.toLowerCase(), hash.toLowerCase())) {
			return { isValid: false, error: 'Cryptographic signature mismatch: invalid hash' };
		}

		// Parse user payload if present
		const userRaw = params.get('user');
		let user: TelegramUser | undefined;

		if (userRaw) {
			try {
				user = JSON.parse(userRaw) as TelegramUser;
			} catch {
				return { isValid: false, error: 'Malformed user JSON in initData' };
			}
		}

		if (!user || typeof user.id !== 'number' || isNaN(user.id)) {
			return { isValid: false, error: 'No valid user data present in validated initData' };
		}

		return {
			isValid: true,
			user,
			authDate,
			queryId: params.get('query_id') ?? undefined
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown validation error';
		return { isValid: false, error: `Validation exception: ${message}` };
	}
}

/**
 * Extracts and authenticates Telegram user from an incoming HTTP Request.
 * Looks for `Authorization: tma <initData>` or `X-Telegram-Init-Data: <initData>`.
 */
export async function authenticateTelegramRequest(
	request: Request,
	botToken: string | undefined
): Promise<TelegramAuthResult> {
	if (!botToken || botToken.trim() === '') {
		return {
			isValid: false,
			error: 'Server secret TELEGRAM_BOT_TOKEN is not configured in Cloudflare environment'
		};
	}

	const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
	let initData: string | null = null;

	if (authHeader) {
		if (authHeader.startsWith('tma ') || authHeader.startsWith('Tma ')) {
			initData = authHeader.slice(4).trim();
		} else {
			initData = authHeader.trim();
		}
	}

	if (!initData) {
		initData = request.headers.get('x-telegram-init-data') || request.headers.get('X-Telegram-Init-Data');
	}

	if (!initData) {
		return {
			isValid: false,
			error: 'Missing Telegram authentication header (Authorization: tma <initData> or X-Telegram-Init-Data)'
		};
	}

	return validateTelegramInitData(initData, botToken);
}
