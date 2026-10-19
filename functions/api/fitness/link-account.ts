import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import { consumeSessionToken } from '../../lib/accountLinkingService';
import { linkFitBaseToClientProfile } from '../../lib/fitnessService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
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
		const body = (await context.request.json()) as { sessionToken?: string };
		if (!body.sessionToken) {
			return new Response(JSON.stringify({ error: 'Не указан токен подтверждённой сессии' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const telegramId = auth.user.id.toString();

		// Validate & consume single-use token (replay protection)
		const sessionResult = await consumeSessionToken(
			context.env.DB,
			telegramId,
			body.sessionToken
		);

		if (!sessionResult.success || !sessionResult.phoneNumber) {
			return new Response(JSON.stringify({ error: sessionResult.error ?? 'Недействительная сессия' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Link FitBase membership
		const updatedProfile = await linkFitBaseToClientProfile(
			context.env.DB,
			telegramId,
			sessionResult.phoneNumber
		);

		return new Response(
			JSON.stringify({
				success: true,
				profile: updatedProfile
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Link account failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
