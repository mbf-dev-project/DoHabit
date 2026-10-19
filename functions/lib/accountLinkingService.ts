/**
 * Account Linking & OTP Security Service
 *
 * Implements:
 * 1. Cryptographic keyed HMAC storage for 6-digit OTP codes (HMAC-SHA256 with OTP_HMAC_SECRET and random salt).
 * 2. Constant-time comparison using Cloudflare Workers `crypto.subtle.timingSafeEqual()` with Node/test fallback.
 * 3. Atomic single-consumption CAS in D1 to prevent race conditions and double-use of OTP and session tokens.
 * 4. Storing session tokens in D1 exclusively as irreversible SHA-256 hashes.
 * 5. Strict fail-closed security: mock mode is completely disabled in production, and absence of secret causes rejection.
 * 6. Rate limiting (max 3 attempts) and 5-minute TTL.
 */

export interface OtpRecord {
	id: string;
	telegram_id: string;
	phone_number: string;
	code_hash: string;
	salt: string;
	attempts_count: number;
	max_attempts: number;
	expires_at: number;
	used_at: number | null;
	session_token: string | null;
	session_expires_at: number | null;
	created_at: number;
}

export interface RequestOtpResult {
	success: boolean;
	otpRequestId?: string;
	expiresInSeconds?: number;
	mockCodeForTesting?: string;
	error?: string;
}

export interface VerifyOtpResult {
	success: boolean;
	sessionToken?: string;
	sessionExpiresInSeconds?: number;
	error?: string;
}

export interface CreateOtpOptions {
	otpSecret?: string;
	isProduction?: boolean;
	allowLocalMock?: boolean;
}

export interface VerifyOtpOptions {
	otpSecret?: string;
	isProduction?: boolean;
}

/**
 * Constant-time comparison function:
 * 1. Uses Cloudflare Workers documented extension `crypto.subtle.timingSafeEqual()` when available in Workerd runtime.
 * 2. Uses Node.js / Vitest native `crypto.timingSafeEqual()` when running in test runtime.
 * 3. Falls back to constant-time byte XOR comparison if neither runtime provides a native helper.
 */
export function safeTimingEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) {
		return false;
	}

	// 1. Cloudflare Workers extension: crypto.subtle.timingSafeEqual(a, b)
	const subtle = crypto.subtle as unknown as {
		timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
	};
	if (typeof subtle?.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(a, b);
	}

	// 2. Node.js runtime / Vitest environment: crypto.timingSafeEqual(a, b)
	const nodeCrypto = crypto as unknown as {
		timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
	};
	if (typeof nodeCrypto?.timingSafeEqual === 'function') {
		return nodeCrypto.timingSafeEqual(a, b);
	}

	// 3. Constant-time byte-level XOR fallback
	let mismatch = 0;
	for (let i = 0; i < a.byteLength; i++) {
		mismatch |= a[i] ^ b[i];
	}
	return mismatch === 0;
}

/**
 * Converts hexadecimal string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) {
		return new Uint8Array(0);
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}

/**
 * Computes keyed HMAC-SHA256 of code + salt using the server secret.
 * Protects against offline rainbow table brute-forcing in case of D1 database leaks.
 */
export async function computeOtpHmac(
	code: string,
	salt: string,
	secret: string
): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const data = encoder.encode(`${code}:${salt}`);
	const signature = await crypto.subtle.sign('HMAC', key, data);
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Computes SHA-256 hash of session token.
 * Session tokens are stored in D1 only in hashed form.
 */
export async function hashSessionToken(rawToken: string): Promise<string> {
	const encoder = new TextEncoder();
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(rawToken));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Legacy hash function preserved for backward compatibility.
 * @deprecated Use computeOtpHmac instead for keyed protection.
 */
export async function hashCodeWithSalt(code: string, salt: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`${code}:${salt}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Generates a random cryptographic salt (16 bytes = 32 hex chars).
 */
export function generateSalt(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Generates a 6-digit numeric OTP code (100000 - 999999).
 */
export function generateOtpCode(): string {
	const array = new Uint32Array(1);
	crypto.getRandomValues(array);
	const code = 100000 + (array[0] % 900000);
	return code.toString();
}

/**
 * Request OTP: generates 6-digit code, hashes with server-keyed HMAC + salt, saves into D1.
 * Fail-closed: In production, requires OTP_HMAC_SECRET and never returns mock code.
 */
export async function createAccountLinkingOtp(
	db: D1Database,
	telegramId: string,
	rawPhone: string,
	options: CreateOtpOptions = {}
): Promise<RequestOtpResult> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const phone = rawPhone.replace(/[^\d+]/g, '');

	if (!phone || phone.length < 9) {
		return { success: false, error: 'Некорректный номер телефона' };
	}

	// Secret validation: fail-closed in production if secret is missing
	const secret = options.otpSecret || (!options.isProduction ? 'dev-local-hmac-secret-only' : '');
	if (!secret || secret.trim() === '') {
		return {
			success: false,
			error: 'Ошибка конфигурации безопасности: отсутствует обязательный серверный ключ OTP_HMAC_SECRET'
		};
	}

	const otpCode = generateOtpCode();
	const salt = generateSalt();
	const codeHash = await computeOtpHmac(otpCode, salt, secret);
	const requestId = crypto.randomUUID();
	const expiresIn = 300; // 5 minutes
	const expiresAt = nowSeconds + expiresIn;

	await db
		.prepare(
			`INSERT INTO account_linking_otp
			(id, telegram_id, phone_number, code_hash, salt, attempts_count, max_attempts, expires_at, created_at)
			VALUES (?, ?, ?, ?, ?, 0, 3, ?, ?)`
		)
		.bind(requestId, telegramId, phone, codeHash, salt, expiresAt, nowSeconds)
		.run();

	const result: RequestOtpResult = {
		success: true,
		otpRequestId: requestId,
		expiresInSeconds: expiresIn
	};

	// Mock code provided ONLY when explicitly permitted in local non-production environment
	if (options.allowLocalMock === true && !options.isProduction) {
		result.mockCodeForTesting = otpCode;
	}

	return result;
}

/**
 * Verifies OTP code: checks attempts, expiration, replay protection, and issues single-use session token.
 * Performs atomic CAS update to prevent race conditions and concurrent double-consumption.
 */
export async function verifyAccountLinkingOtp(
	db: D1Database,
	telegramId: string,
	otpRequestId: string,
	inputCode: string,
	options: VerifyOtpOptions = {}
): Promise<VerifyOtpResult> {
	const nowSeconds = Math.floor(Date.now() / 1000);

	// Validate 6-digit code format
	const cleanedCode = inputCode.trim();
	if (!/^\d{6}$/.test(cleanedCode)) {
		return { success: false, error: 'Код верификации должен состоять ровно из 6 цифр' };
	}

	// Secret validation: fail-closed in production if secret is missing
	const secret = options.otpSecret || (!options.isProduction ? 'dev-local-hmac-secret-only' : '');
	if (!secret || secret.trim() === '') {
		return {
			success: false,
			error: 'Ошибка конфигурации безопасности: отсутствует обязательный серверный ключ OTP_HMAC_SECRET'
		};
	}

	const record = await db
		.prepare(`SELECT * FROM account_linking_otp WHERE id = ? AND telegram_id = ?`)
		.bind(otpRequestId, telegramId)
		.first<OtpRecord>();

	if (!record) {
		return { success: false, error: 'Запрос верификации не найден' };
	}

	// 1. Replay protection check
	if (record.used_at !== null) {
		return { success: false, error: 'Код уже был использован (повторная отправка отклонена)' };
	}

	// 2. Expiration check (5 minutes TTL)
	if (nowSeconds > record.expires_at) {
		return { success: false, error: 'Срок действия кода истёк. Запросите новый код' };
	}

	// 3. Attempt limit check (maximum 3 attempts)
	if (record.attempts_count >= record.max_attempts) {
		return {
			success: false,
			error: 'Превышен лимит попыток ввода кода (максимум 3). Запросите новый код'
		};
	}

	// 4. Verify keyed HMAC with constant-time comparison
	const expectedHmac = await computeOtpHmac(cleanedCode, record.salt, secret);
	const expectedBytes = hexToBytes(expectedHmac);
	const storedBytes = hexToBytes(record.code_hash);
	const isMatch = safeTimingEqual(expectedBytes, storedBytes);

	if (!isMatch) {
		const newAttempts = record.attempts_count + 1;
		await db
			.prepare(`UPDATE account_linking_otp SET attempts_count = ? WHERE id = ?`)
			.bind(newAttempts, otpRequestId)
			.run();

		const remaining = record.max_attempts - newAttempts;
		return {
			success: false,
			error:
				remaining > 0
					? `Неверный код. Осталось попыток: ${remaining}`
					: 'Неверный код. Лимит попыток исчерпан. Запросите новый код'
		};
	}

	// 5. ATOMIC CONSUMPTION & Replay Protection:
	// Generate high-entropy raw session token, but store ONLY its SHA-256 hash in D1
	const rawSessionToken = `${crypto.randomUUID()}-${generateSalt()}`;
	const hashedSessionToken = await hashSessionToken(rawSessionToken);
	const sessionExpiresIn = 600; // 10 minutes
	const sessionExpiresAt = nowSeconds + sessionExpiresIn;

	// Atomic CAS update: only updates if used_at IS NULL and still within attempts and expiration
	const updateRes = await db
		.prepare(
			`UPDATE account_linking_otp
			SET used_at = ?, session_token = ?, session_expires_at = ?
			WHERE id = ?
			  AND telegram_id = ?
			  AND used_at IS NULL
			  AND attempts_count < max_attempts
			  AND expires_at > ?`
		)
		.bind(nowSeconds, hashedSessionToken, sessionExpiresAt, otpRequestId, telegramId, nowSeconds)
		.run();

	const changes = (updateRes as any)?.meta?.changes ?? (updateRes as any)?.changes;
	if (changes === 0) {
		return {
			success: false,
			error: 'Код уже был использован или обрабатывается другим запросом'
		};
	}

	return {
		success: true,
		sessionToken: rawSessionToken,
		sessionExpiresInSeconds: sessionExpiresIn
	};
}

/**
 * Validates and atomically consumes single-use session token for final account linking.
 * The session token is stored in D1 as a SHA-256 hash and can be redeemed only once.
 */
export async function consumeSessionToken(
	db: D1Database,
	telegramId: string,
	rawSessionToken: string
): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
	const nowSeconds = Math.floor(Date.now() / 1000);

	if (!rawSessionToken || typeof rawSessionToken !== 'string') {
		return { success: false, error: 'Недействительный токен сессии' };
	}

	const hashedSessionToken = await hashSessionToken(rawSessionToken.trim());

	const record = await db
		.prepare(
			`SELECT * FROM account_linking_otp
			WHERE session_token = ? AND telegram_id = ?`
		)
		.bind(hashedSessionToken, telegramId)
		.first<OtpRecord>();

	if (!record) {
		return { success: false, error: 'Недействительный или отсутствующий токен сессии' };
	}

	if (!record.session_expires_at || nowSeconds > record.session_expires_at) {
		return { success: false, error: 'Срок действия сессии привязки истёк' };
	}

	// ATOMIC CONSUMPTION:
	// Invalidate session token immediately with CAS condition (session_expires_at > nowSeconds)
	const updateRes = await db
		.prepare(
			`UPDATE account_linking_otp
			SET session_expires_at = 0, session_token = NULL
			WHERE id = ? AND telegram_id = ? AND session_expires_at > ?`
		)
		.bind(record.id, telegramId, nowSeconds)
		.run();

	const changes = (updateRes as any)?.meta?.changes ?? (updateRes as any)?.changes;
	if (changes === 0) {
		return { success: false, error: 'Сессия уже была использована другим запросом' };
	}

	return {
		success: true,
		phoneNumber: record.phone_number
	};
}
