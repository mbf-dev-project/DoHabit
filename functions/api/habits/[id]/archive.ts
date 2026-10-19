import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import {
	formatHabit,
	upsertTelegramUser
} from '../../../lib/habitsService';

interface ArchiveBody {
	isArchived: boolean;
}

/**
 * PATCH /api/habits/:id/archive
 * Archives or restores a habit for the authenticated user.
 */
export const onRequestPatch: PagesFunction<Env, 'id'> = async (context) => {
	const { request, env, params } = context;
	const habitId = String(params.id);

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	let body: ArchiveBody;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (typeof body.isArchived !== 'boolean') {
		return Response.json({ error: 'isArchived must be a boolean' }, { status: 400 });
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

		const isArchivedInt = body.isArchived ? 1 : 0;
		const nowMs = Date.now();

		await env.DB.prepare(
			`UPDATE habits
			    SET is_archived = ?,
			        updated_at = ?
			  WHERE id = ? AND user_id = ?`
		)
			.bind(isArchivedInt, nowMs, habitId, userIdStr)
			.run();

		// Fetch completions
		const completionsResult = await env.DB.prepare(
			`SELECT completed_date, is_yesterday_used
			   FROM habit_completions
			  WHERE habit_id = ? AND user_id = ?
		   ORDER BY completed_date DESC`
		)
			.bind(habitId, userIdStr)
			.all();

		const completions = completionsResult.results ?? [];

		return Response.json(
			formatHabit(
				{
					...habit,
					is_archived: isArchivedInt,
					updated_at: nowMs
				},
				completions
			)
		);
	} catch (error) {
		console.error('Failed to update habit archive status:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
