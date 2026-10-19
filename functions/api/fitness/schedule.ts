import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import { getClassesScheduleWithBookings } from '../../lib/fitnessService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
}

/**
 * GET /api/fitness/schedule
 *
 * Read-only FitBase schedule endpoint for Mayweather Boxing + Fitness.
 * Returns slots for viewing without allowing client-side booking mutations.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const schedule = await getClassesScheduleWithBookings(
			context.env.DB,
			auth.user.id.toString()
		);

		return new Response(JSON.stringify({ schedule }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Schedule query failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

/**
 * POST /api/fitness/schedule
 *
 * In MVP v1, booking mutations are disabled; schedule is strictly read-only.
 */
export const onRequestPost: PagesFunction<Env> = async () => {
	return new Response(
		JSON.stringify({
			error: 'В первой версии расписание FitBase работает только в режиме чтения. Бронирование через API отключено.'
		}),
		{
			status: 405,
			headers: { 'Content-Type': 'application/json', Allow: 'GET' }
		}
	);
};
