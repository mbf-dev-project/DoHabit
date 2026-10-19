import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import {
	formatHabit,
	getTashkentDate,
	upsertTelegramUser,
	validateHabitPayload
} from '../../lib/habitsService';

/**
 * GET /api/habits
 * Returns all habits and their completed days history for the authenticated user.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
	const { request, env } = context;

	const auth = await authenticateTelegramRequest(request, env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return Response.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
	}

	try {
		await upsertTelegramUser(env.DB, auth.user);
		const userIdStr = String(auth.user.id);

		// Fetch user's habits
		const habitsResult = await env.DB.prepare(
			`SELECT * FROM habits
			  WHERE user_id = ?
		   ORDER BY is_archived ASC, sort_order ASC, created_at DESC`
		)
			.bind(userIdStr)
			.all();

		const habitsRows = habitsResult.results ?? [];

		if (habitsRows.length === 0) {
			return Response.json([]);
		}

		// Fetch all completions for the user
		const completionsResult = await env.DB.prepare(
			`SELECT habit_id, completed_date, is_yesterday_used
			   FROM habit_completions
			  WHERE user_id = ?
		   ORDER BY completed_date DESC`
		)
			.bind(userIdStr)
			.all();

		const completionsRows = completionsResult.results ?? [];

		// Group completions by habit_id
		const completionsByHabit = new Map<string, any[]>();
		for (const row of completionsRows) {
			const habitId = String(row.habit_id);
			if (!completionsByHabit.has(habitId)) {
				completionsByHabit.set(habitId, []);
			}
			completionsByHabit.get(habitId)!.push(row);
		}

		const formattedHabits = habitsRows.map((habitRow) => {
			const habitId = String(habitRow.id);
			const completions = completionsByHabit.get(habitId) ?? [];
			return formatHabit(habitRow, completions);
		});

		return Response.json(formattedHabits);
	} catch (error) {
		console.error('Failed to fetch habits:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

/**
 * POST /api/habits
 * Creates a new habit for the authenticated user.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
	const { request, env } = context;

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

	const validation = validateHabitPayload(body, false);
	if (!validation.isValid || !validation.data) {
		return Response.json({ error: validation.error ?? 'Invalid habit data' }, { status: 400 });
	}

	try {
		await upsertTelegramUser(env.DB, auth.user);
		const userIdStr = String(auth.user.id);

		const habitId = crypto.randomUUID();
		const nowMs = Date.now();
		const today = getTashkentDate(0);

		const title = validation.data.title;
		const frequency = validation.data.frequency ?? 1;
		const colorIndex = validation.data.colorIndex ?? 0;
		const iconTitle = validation.data.iconTitle ?? 'boxing';
		const sortOrder = validation.data.sortOrder ?? 0;

		await env.DB.prepare(
			`INSERT INTO habits (
				id, user_id, title, frequency, current_progress, last_activity_date,
				color_index, icon_title, sort_order, is_archived, created_at, updated_at
			) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?)`
		)
			.bind(
				habitId,
				userIdStr,
				title,
				frequency,
				today,
				colorIndex,
				iconTitle,
				sortOrder,
				nowMs,
				nowMs
			)
			.run();

		const createdHabit = formatHabit(
			{
				id: habitId,
				title,
				frequency,
				current_progress: 0,
				last_activity_date: today,
				color_index: colorIndex,
				icon_title: iconTitle,
				sort_order: sortOrder,
				is_archived: 0,
				created_at: nowMs
			},
			[]
		);

		return Response.json(createdHabit, { status: 201 });
	} catch (error) {
		console.error('Failed to create habit:', error);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
