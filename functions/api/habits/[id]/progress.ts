import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import {
	formatHabit,
	getTashkentDate,
	upsertTelegramUser
} from '../../../lib/habitsService';

interface ProgressBody {
	isLongPress?: boolean;
}

/**
 * POST /api/habits/:id/progress
 * Increments or toggles today's habit progress (in Asia/Tashkent timezone).
 */
export const onRequestPost: PagesFunction<Env, 'id'> = async (context) => {
	const { request, env, params } = context;
	const habitId = String(params.id);

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	let isLongPress = false;
	try {
		const text = await request.text();
		if (text && text.trim().length > 0) {
			const body: ProgressBody = JSON.parse(text);
			isLongPress = Boolean(body.isLongPress);
		}
	} catch {
		return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
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

		const today = getTashkentDate(0);
		const nowMs = Date.now();

		// Check if completion record already exists for today
		const existingCompletion: any = await env.DB.prepare(
			`SELECT id FROM habit_completions
			  WHERE habit_id = ? AND user_id = ? AND completed_date = ?`
		)
			.bind(habitId, userIdStr, today)
			.first();

		const isCompleted = Boolean(existingCompletion);

		// If habit is already completed today:
		if (isCompleted) {
			// Long press on already completed habit does not toggle
			if (isLongPress) {
				const completions = await fetchCompletions(env.DB, habitId, userIdStr);
				return Response.json(formatHabit(habit, completions));
			}

			// Regular click toggles off: delete today's completion and reset progress to 0
			await env.DB.batch([
				env.DB.prepare(
					`DELETE FROM habit_completions
					  WHERE habit_id = ? AND user_id = ? AND completed_date = ?`
				).bind(habitId, userIdStr, today),
				env.DB.prepare(
					`UPDATE habits
					    SET current_progress = 0,
					        last_activity_date = ?,
					        updated_at = ?
					  WHERE id = ? AND user_id = ?`
				).bind(today, nowMs, habitId, userIdStr)
			]);

			const completions = await fetchCompletions(env.DB, habitId, userIdStr);
			return Response.json(
				formatHabit(
					{
						...habit,
						current_progress: 0,
						last_activity_date: today,
						updated_at: nowMs
					},
					completions
				)
			);
		}

		// Not yet completed today:
		const currentDayProgress = habit.last_activity_date === today ? habit.current_progress : 0;
		const nextProgress = isLongPress ? habit.frequency : currentDayProgress + 1;
		const isNowCompleted = nextProgress >= habit.frequency;

		if (isNowCompleted) {
			// Mark completed in habit_completions and update habits
			await env.DB.batch([
				env.DB.prepare(
					`INSERT INTO habit_completions (habit_id, user_id, completed_date, is_yesterday_used, created_at)
					 VALUES (?, ?, ?, 0, unixepoch())
					 ON CONFLICT(habit_id, completed_date) DO NOTHING`
				).bind(habitId, userIdStr, today),
				env.DB.prepare(
					`UPDATE habits
					    SET current_progress = ?,
					        last_activity_date = ?,
					        updated_at = ?
					  WHERE id = ? AND user_id = ?`
				).bind(nextProgress, today, nowMs, habitId, userIdStr)
			]);
		} else {
			// Increment partial progress without completion record
			await env.DB.prepare(
				`UPDATE habits
				    SET current_progress = ?,
				        last_activity_date = ?,
				        updated_at = ?
				  WHERE id = ? AND user_id = ?`
			)
				.bind(nextProgress, today, nowMs, habitId, userIdStr)
				.run();
		}

		const completions = await fetchCompletions(env.DB, habitId, userIdStr);
		return Response.json(
			formatHabit(
				{
					...habit,
					current_progress: nextProgress,
					last_activity_date: today,
					updated_at: nowMs
				},
				completions
			)
		);
	} catch (error) {
		console.error('Failed to update habit progress:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

async function fetchCompletions(db: D1Database, habitId: string, userId: string): Promise<any[]> {
	const res = await db
		.prepare(
			`SELECT completed_date, is_yesterday_used
			   FROM habit_completions
			  WHERE habit_id = ? AND user_id = ?
		   ORDER BY completed_date DESC`
		)
		.bind(habitId, userId)
		.all();
	return res.results ?? [];
}
