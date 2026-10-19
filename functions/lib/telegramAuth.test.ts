import { describe, expect, it } from 'vitest';
import {
	authenticateTelegramRequest,
	validateTelegramInitData,
	type TelegramUser
} from './telegramAuth';

const TEST_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz_TEST_TOKEN';

/**
 * Helper to compute official Telegram WebApp HMAC-SHA256 signature and return complete query string.
 */
async function generateTestInitData(
	params: Record<string, string>,
	botToken: string
): Promise<string> {
	const searchParams = new URLSearchParams(params);
	const keys = Array.from(searchParams.keys()).sort();
	const dataCheckString = keys.map((key) => `${key}=${searchParams.get(key)}`).join('\n');

	const encoder = new TextEncoder();
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

	const signingKey = await crypto.subtle.importKey(
		'raw',
		secretKeyBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const sigBuffer = await crypto.subtle.sign(
		'HMAC',
		signingKey,
		encoder.encode(dataCheckString)
	);

	const hash = Array.from(new Uint8Array(sigBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	searchParams.set('hash', hash);
	return searchParams.toString();
}

describe('validateTelegramInitData', () => {
	it('should validate against a precomputed independent static test vector without relying on runtime generator', async () => {
		// Hardcoded static test vector:
		// Bot Token: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz_DUMMY_TOKEN
		// auth_date: 1710000000
		// query_id: AAHdF6IQAAAAAN0XohDhrOrc
		// user: {"id":279058397,"first_name":"Vladislav","last_name":"K","username":"vladislav_k","language_code":"ru","is_premium":true}
		// Precomputed reference hash: 990446e5e8605d69f92e19a7fad1ae176fff0f0b7aed70d86f6fd0cc2070d324
		const staticBotToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz_DUMMY_TOKEN';
		const staticInitData =
			'auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22K%22%2C%22username%22%3A%22vladislav_k%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%7D&hash=990446e5e8605d69f92e19a7fad1ae176fff0f0b7aed70d86f6fd0cc2070d324';

		// Verify with maxAgeSeconds = 0 (disables expiration check for static test vectors)
		const result = await validateTelegramInitData(staticInitData, staticBotToken, 0);

		expect(result.isValid).toBe(true);
		expect(result.user?.id).toBe(279058397);
		expect(result.user?.first_name).toBe('Vladislav');
		expect(result.user?.username).toBe('vladislav_k');
		expect(result.authDate).toBe(1710000000);
		expect(result.queryId).toBe('AAHdF6IQAAAAAN0XohDhrOrc');

		// Corrupt the static hash by changing the last character
		const corruptedInitData = staticInitData.replace('2070d324', '2070d325');
		const corruptedResult = await validateTelegramInitData(corruptedInitData, staticBotToken, 0);
		expect(corruptedResult.isValid).toBe(false);
		expect(corruptedResult.error).toContain('Cryptographic signature mismatch');
	});

	const sampleUser: TelegramUser = {
		id: 987654321,
		first_name: 'Floyd',
		last_name: 'Mayweather',
		username: 'money_mayweather',
		language_code: 'en'
	};

	it('should successfully validate valid initData and extract user info', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				query_id: 'AAGH_sample_query_id',
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(true);
		expect(result.user).toEqual(sampleUser);
		expect(result.authDate).toBe(nowSeconds);
		expect(result.queryId).toBe('AAGH_sample_query_id');
		expect(result.error).toBeUndefined();
	});

	it('should reject initData when the signature hash is altered / corrupted', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		// Corrupt hash parameter while preserving 64 hex length
		const params = new URLSearchParams(rawInitData);
		const originalHash = params.get('hash')!;
		const corruptedHash = originalHash.slice(0, -1) + (originalHash.endsWith('0') ? '1' : '0');
		params.set('hash', corruptedHash);

		const result = await validateTelegramInitData(params.toString(), TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Cryptographic signature mismatch');
		expect(result.user).toBeUndefined();
	});

	it('should reject initData when hash format is invalid (not 64 hex characters)', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const params = new URLSearchParams(rawInitData);
		params.set('hash', 'short_invalid_hash');

		const result = await validateTelegramInitData(params.toString(), TEST_BOT_TOKEN);
		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Invalid hash format: must be 64 hexadecimal characters');
	});

	it('should reject initData when payload is tampered with after signing', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		// Modify payload (attacker tries to impersonate another user id without knowing botToken)
		const params = new URLSearchParams(rawInitData);
		params.set('user', JSON.stringify({ ...sampleUser, id: 111111111 }));

		const result = await validateTelegramInitData(params.toString(), TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Cryptographic signature mismatch');
	});

	it('should reject initData if signed with a different bot token', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			'WRONG_BOT_TOKEN_123456'
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Cryptographic signature mismatch');
	});

	it('should reject initData when hash parameter is missing', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const params = new URLSearchParams({
			auth_date: String(nowSeconds),
			user: JSON.stringify(sampleUser)
		});

		const result = await validateTelegramInitData(params.toString(), TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('Missing hash parameter in initData');
	});

	it('should reject initData when auth_date is missing', async () => {
		const rawInitData = await generateTestInitData(
			{
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('Missing auth_date in initData');
	});

	it('should reject initData when auth_date is non-numeric or invalid', async () => {
		const rawInitData = await generateTestInitData(
			{
				auth_date: 'invalid_not_a_number',
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('Invalid auth_date format');
	});

	it('should reject initData when auth_date has expired (> 24h by default)', async () => {
		const expiredAuthDate = Math.floor(Date.now() / 1000) - 90_000; // 25 hours ago
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(expiredAuthDate),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('initData has expired');
	});

	it('should reject initData when auth_date is in the future (> 120s skew)', async () => {
		const futureAuthDate = Math.floor(Date.now() / 1000) + 3600; // 1 hour in the future
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(futureAuthDate),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('initData timestamp is in the future');
	});

	it('should reject initData when user JSON is malformed', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: '{"id": 123, invalid_json'
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('Malformed user JSON in initData');
	});

	it('should reject initData when user object lacks an id', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify({ first_name: 'NoIdUser' })
			},
			TEST_BOT_TOKEN
		);

		const result = await validateTelegramInitData(rawInitData, TEST_BOT_TOKEN);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('No valid user data present in validated initData');
	});

	it('should fail securely when TELEGRAM_BOT_TOKEN is missing or empty', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const resultEmpty = await validateTelegramInitData(rawInitData, '');
		expect(resultEmpty.isValid).toBe(false);
		expect(resultEmpty.error).toContain('TELEGRAM_BOT_TOKEN is not configured');

		const resultWhitespace = await validateTelegramInitData(rawInitData, '   ');
		expect(resultWhitespace.isValid).toBe(false);
		expect(resultWhitespace.error).toContain('TELEGRAM_BOT_TOKEN is not configured');
	});

	it('should reject empty or non-string initData', async () => {
		const resultNull = await validateTelegramInitData(null as any, TEST_BOT_TOKEN);
		expect(resultNull.isValid).toBe(false);
		expect(resultNull.error).toBe('Empty or missing initData');

		const resultEmpty = await validateTelegramInitData('', TEST_BOT_TOKEN);
		expect(resultEmpty.isValid).toBe(false);
		expect(resultEmpty.error).toBe('Empty or missing initData');
	});
});

describe('authenticateTelegramRequest', () => {
	const sampleUser: TelegramUser = {
		id: 555666777,
		first_name: 'Roger',
		last_name: 'Mayweather'
	};

	it('should authenticate request with Authorization: tma <initData>', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const request = new Request('https://api.mayweather.app/api/habits', {
			headers: {
				Authorization: `tma ${rawInitData}`
			}
		});

		const result = await authenticateTelegramRequest(request, TEST_BOT_TOKEN);
		expect(result.isValid).toBe(true);
		expect(result.user?.id).toBe(555666777);
	});

	it('should authenticate request with X-Telegram-Init-Data header', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rawInitData = await generateTestInitData(
			{
				auth_date: String(nowSeconds),
				user: JSON.stringify(sampleUser)
			},
			TEST_BOT_TOKEN
		);

		const request = new Request('https://api.mayweather.app/api/habits', {
			headers: {
				'X-Telegram-Init-Data': rawInitData
			}
		});

		const result = await authenticateTelegramRequest(request, TEST_BOT_TOKEN);
		expect(result.isValid).toBe(true);
		expect(result.user?.id).toBe(555666777);
	});

	it('should reject request when TELEGRAM_BOT_TOKEN is undefined on the server', async () => {
		const request = new Request('https://api.mayweather.app/api/habits', {
			headers: {
				Authorization: 'tma sample_data'
			}
		});

		const result = await authenticateTelegramRequest(request, undefined);
		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Server secret TELEGRAM_BOT_TOKEN is not configured');
	});

	it('should reject request when auth headers are completely missing', async () => {
		const request = new Request('https://api.mayweather.app/api/habits');

		const result = await authenticateTelegramRequest(request, TEST_BOT_TOKEN);
		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Missing Telegram authentication header');
	});
});
