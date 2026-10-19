import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import { getOrCreateClientProfile } from '../../lib/fitnessService';

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
		const profile = await getOrCreateClientProfile(
			context.env.DB,
			auth.user.id.toString(),
			auth.user.first_name,
			auth.user.last_name ?? ''
		);

		return new Response(JSON.stringify({ profile }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown database error';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body = (await context.request.json()) as any;
		const telegramId = auth.user.id.toString();
		const now = Math.floor(Date.now() / 1000);

		await context.env.DB.prepare(
			`UPDATE client_profiles
			SET height_cm = COALESCE(?, height_cm),
			    weight_kg = COALESCE(?, weight_kg),
			    fitness_goal = COALESCE(?, fitness_goal),
			    initial_fitness_level = COALESCE(?, initial_fitness_level),
			    updated_at = ?
			WHERE telegram_id = ?`
		)
			.bind(
				body.height_cm ?? null,
				body.weight_kg ?? null,
				body.fitness_goal ?? null,
				body.initial_fitness_level ?? null,
				now,
				telegramId
			)
			.run();

		const profile = await getOrCreateClientProfile(
			context.env.DB,
			telegramId,
			auth.user.first_name,
			auth.user.last_name ?? ''
		);

		return new Response(JSON.stringify({ profile }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Update failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
