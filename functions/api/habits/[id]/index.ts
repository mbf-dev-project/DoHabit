import { authenticateTelegramRequest } from '../../../lib/telegramAuth';
import {
	formatHabit,
	getTashkentDate,
	upsertTelegramUser,
	validateHabitPayload
} from '../../../lib/habitsService';

/**
 * PUT /api/habits/:id
 * Updates an existing habit for the authenticated user.
 */
export const onRequestPut: PagesFunction<Env, 'id'> = async (context) => {
	const { request, env, params } = context;
	const habitId = String(params.id);

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateHabitPayload(body, true);
	if (!validation.isValid || !validation.data) {
		return Response.json({ error: validation.error ?? 'Invalid habit data' }, { status: 400 });
	}

	try {
		await upsertTelegramUser(env.DB, auth.user);
		const userIdStr = String(auth.user.id);

		// Check if habit exists and belongs to the user
		const existingHabit: any = await env.DB.prepare(
			`SELECT * FROM habits WHERE id = ? AND user_id = ?`
		)
			.bind(habitId, userIdStr)
			.first();

		if (!existingHabit) {
			return Response.json({ error: 'Habit not found' }, { status: 404 });
		}

		const today = getTashkentDate(0);

		// Determine new field values
		const title = validation.data.title || existingHabit.title;
		const frequency = validation.data.frequency ?? existingHabit.frequency;
		const colorIndex = validation.data.colorIndex ?? existingHabit.color_index;
		const iconTitle = validation.data.iconTitle ?? existingHabit.icon_title;
		const sortOrder = validation.data.sortOrder ?? existingHabit.sort_order;

		let currentProgress = existingHabit.current_progress;

		// If frequency changed, adjust progress
		if (frequency !== existingHabit.frequency) {
			const isCompletedToday: any = await env.DB.prepare(
				`SELECT 1 FROM habit_completions
				  WHERE habit_id = ? AND user_id = ? AND completed_date = ?`
			)
				.bind(habitId, userIdStr, today)
				.first();

			currentProgress = isCompletedToday ? frequency : 0;
		}

		const nowMs = Date.now();

		await env.DB.prepare(
			`UPDATE habits
			    SET title = ?,
			        frequency = ?,
			        current_progress = ?,
			        color_index = ?,
			        icon_title = ?,
			        sort_order = ?,
			        updated_at = ?
			  WHERE id = ? AND user_id = ?`
		)
			.bind(
				title,
				frequency,
				currentProgress,
				colorIndex,
				iconTitle,
				sortOrder,
				nowMs,
				habitId,
				userIdStr
			)
			.run();

		// Fetch completions to return updated Habit object
		const completionsResult = await env.DB.prepare(
			`SELECT completed_date, is_yesterday_used
			   FROM habit_completions
			  WHERE habit_id = ? AND user_id = ?
		   ORDER BY completed_date DESC`
		)
			.bind(habitId, userIdStr)
			.all();

		const completions = completionsResult.results ?? [];

		const updatedHabit = formatHabit(
			{
				...existingHabit,
				title,
				frequency,
				current_progress: currentProgress,
				color_index: colorIndex,
				icon_title: iconTitle,
				sort_order: sortOrder,
				updated_at: nowMs
			},
			completions
		);

		return Response.json(updatedHabit);
	} catch (error) {
		console.error('Failed to update habit:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

/**
 * DELETE /api/habits/:id
 * Deletes a habit and all associated completion records for the authenticated user.
 */
export const onRequestDelete: PagesFunction<Env, 'id'> = async (context) => {
	const { request, env, params } = context;
	const habitId = String(params.id);

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	try {
		await upsertTelegramUser(env.DB, auth.user);
		const userIdStr = String(auth.user.id);

		// Check if habit exists and belongs to user
		const existingHabit: any = await env.DB.prepare(
			`SELECT id FROM habits WHERE id = ? AND user_id = ?`
		)
			.bind(habitId, userIdStr)
			.first();

		if (!existingHabit) {
			return Response.json({ error: 'Habit not found' }, { status: 404 });
		}

		// Delete completions and habit atomically
		await env.DB.batch([
			env.DB.prepare(`DELETE FROM habit_completions WHERE habit_id = ? AND user_id = ?`).bind(habitId, userIdStr),
			env.DB.prepare(`DELETE FROM habits WHERE id = ? AND user_id = ?`).bind(habitId, userIdStr)
		]);

		return Response.json({ success: true, id: habitId });
	} catch (error) {
		console.error('Failed to delete habit:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
