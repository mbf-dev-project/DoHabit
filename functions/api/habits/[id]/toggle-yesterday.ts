import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import {
	formatHabit,
	getTashkentYesterday,
	upsertTelegramUser
} from '../../../lib/habitsService';

/**
 * POST /api/habits/:id/toggle-yesterday
 * Toggles completion status for yesterday (in Asia/Tashkent timezone).
 */
export const onRequestPost: PagesFunction<Env, 'id'> = async (context) => {
	const { request, env, params } = context;
	const habitId = String(params.id);

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	try {
		await upsertTelegramUser(env.DB, auth.user);
		const userIdStr = String(auth.user.id);

		// Verify habit exists and belongs to user
		const habit: any = await env.DB.prepare(
			`SELECT * FROM habits WHERE id = ? AND user_id = ?`
		)
			.bind(habitId, userIdStr)
			.first();

		if (!habit) {
			return Response.json({ error: 'Habit not found' }, { status: 404 });
		}

		const yesterday = getTashkentYesterday();

		// Check if yesterday is already marked
		const existingYesterday: any = await env.DB.prepare(
			`SELECT id FROM habit_completions
			  WHERE habit_id = ? AND user_id = ? AND completed_date = ?`
		)
			.bind(habitId, userIdStr, yesterday)
			.first();

		if (existingYesterday) {
			// Toggle off: remove yesterday record
			await env.DB.prepare(
				`DELETE FROM habit_completions
				  WHERE habit_id = ? AND user_id = ? AND completed_date = ?`
			)
				.bind(habitId, userIdStr, yesterday)
				.run();
		} else {
			// Toggle on: add yesterday record with is_yesterday_used = 1
			await env.DB.prepare(
				`INSERT INTO habit_completions (habit_id, user_id, completed_date, is_yesterday_used, created_at)
				 VALUES (?, ?, ?, 1, unixepoch())
				 ON CONFLICT(habit_id, completed_date) DO NOTHING`
			)
				.bind(habitId, userIdStr, yesterday)
				.run();
		}

		// Fetch updated completions
		const completionsResult = await env.DB.prepare(
			`SELECT completed_date, is_yesterday_used
			   FROM habit_completions
			  WHERE habit_id = ? AND user_id = ?
		   ORDER BY completed_date DESC`
		)
			.bind(habitId, userIdStr)
			.all();

		const completions = completionsResult.results ?? [];

		return Response.json(formatHabit(habit, completions));
	} catch (error) {
		console.error('Failed to toggle yesterday habit status:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
