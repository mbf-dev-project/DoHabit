import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import { createAccountLinkingOtp } from '../../../lib/accountLinkingService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
	OTP_HMAC_SECRET?: string;
	ENVIRONMENT?: string;
	ENABLE_LOCAL_OTP_MOCK?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const isProduction =
			context.env.ENVIRONMENT === 'production' ||
			context.env.ENVIRONMENT === 'prod';

		// Fail-closed mock mode:
		// In production, mock mode is strictly forbidden under any circumstances (even if flag is passed).
		const isLocalMockAllowed = !isProduction && context.env.ENABLE_LOCAL_OTP_MOCK === 'true';

		// Fail-closed secret check:
		const otpSecret = context.env.OTP_HMAC_SECRET;
		if (isProduction && (!otpSecret || otpSecret.trim() === '')) {
			return new Response(
				JSON.stringify({
					error: 'Ошибка конфигурации безопасности: на сервере не настроен OTP_HMAC_SECRET'
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// When SMS delivery is not implemented and mock mode is not explicitly enabled:
		// Fail-closed safe refusal (do not simulate fake delivery)
		if (!isLocalMockAllowed) {
			return new Response(
				JSON.stringify({
					error: 'Сервис доставки SMS не подключён. Привязка карты временно недоступна.'
				}),
				{ status: 503, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const body = (await context.request.json()) as { phoneNumber?: string };
		if (!body.phoneNumber) {
			return new Response(JSON.stringify({ error: 'Номер телефона обязателен' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const result = await createAccountLinkingOtp(
			context.env.DB,
			auth.user.id.toString(),
			body.phoneNumber,
			{
				otpSecret,
				isProduction,
				allowLocalMock: isLocalMockAllowed
			}
		);

		if (!result.success) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Strictly sanitize API response: NEVER leak real OTP, hash, salt, session token, or D1 record internals
		const safeResponse: {
			success: boolean;
			otpRequestId?: string;
			expiresInSeconds?: number;
			mockCodeForTesting?: string;
		} = {
			success: true,
			otpRequestId: result.otpRequestId,
			expiresInSeconds: result.expiresInSeconds
		};

		// Only return mockCodeForTesting if explicitly allowed in local non-production environment
		if (isLocalMockAllowed && result.mockCodeForTesting) {
			safeResponse.mockCodeForTesting = result.mockCodeForTesting;
		}

		return new Response(JSON.stringify(safeResponse), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'OTP request failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
