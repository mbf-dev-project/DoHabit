import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import { getOrCreateWeeklyPlan } from '../../lib/fitnessService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const url = new URL(context.request.url);
		const today = new Date();
		// Compute start of week (Monday)
		const day = today.getDay();
		const diff = today.getDate() - day + (day === 0 ? -6 : 1);
		const monday = new Date(today.setDate(diff)).toISOString().split('T')[0];

		const weekDate = url.searchParams.get('weekDate') ?? monday;
		const plan = await getOrCreateWeeklyPlan(
			context.env.DB,
			auth.user.id.toString(),
			weekDate
		);

		return new Response(JSON.stringify({ plan }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Plan query failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body = (await context.request.json()) as any;
		const planId = body.id;
		if (!planId) {
			return new Response(JSON.stringify({ error: 'Идентификатор плана обязателен' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		await context.env.DB.prepare(
			`UPDATE personal_weekly_plans
			SET target_boxing_sessions = COALESCE(?, target_boxing_sessions),
			    target_strength_sessions = COALESCE(?, target_strength_sessions),
			    target_cardio_minutes = COALESCE(?, target_cardio_minutes),
			    completed_boxing_sessions = COALESCE(?, completed_boxing_sessions),
			    completed_strength_sessions = COALESCE(?, completed_strength_sessions),
			    completed_cardio_minutes = COALESCE(?, completed_cardio_minutes),
			    updated_at = unixepoch()
			WHERE id = ? AND telegram_id = ?`
		)
			.bind(
				body.target_boxing_sessions ?? null,
				body.target_strength_sessions ?? null,
				body.target_cardio_minutes ?? null,
				body.completed_boxing_sessions ?? null,
				body.completed_strength_sessions ?? null,
				body.completed_cardio_minutes ?? null,
				planId,
				auth.user.id.toString()
			)
			.run();

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Update plan failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
