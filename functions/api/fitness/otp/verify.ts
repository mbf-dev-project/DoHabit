import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import { verifyAccountLinkingOtp } from '../../../lib/accountLinkingService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
	OTP_HMAC_SECRET?: string;
	ENVIRONMENT?: string;
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

		const otpSecret = context.env.OTP_HMAC_SECRET;
		if (isProduction && (!otpSecret || otpSecret.trim() === '')) {
			return new Response(
				JSON.stringify({
					error: 'Ошибка конфигурации безопасности: на сервере не настроен OTP_HMAC_SECRET'
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const body = (await context.request.json()) as { otpRequestId?: string; code?: string };
		if (!body.otpRequestId || !body.code) {
			return new Response(JSON.stringify({ error: 'Не указан идентификатор запроса или код верификации' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const result = await verifyAccountLinkingOtp(
			context.env.DB,
			auth.user.id.toString(),
			body.otpRequestId,
			body.code,
			{
				otpSecret,
				isProduction
			}
		);

		if (!result.success) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Only return raw session token to the verified client (D1 stores only its hash)
		return new Response(
			JSON.stringify({
				success: true,
				sessionToken: result.sessionToken,
				sessionExpiresInSeconds: result.sessionExpiresInSeconds
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'OTP verification failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
