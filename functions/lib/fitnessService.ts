/**
 * Mayweather Boxing + Fitness Domain Service
 *
 * Implements business logic for:
 * 1. Client profile & membership cards
 * 2. Strict validation of functional tests (leg strength, balance, mobility, endurance)
 * 3. Schedule viewing & class booking with FitBase mock
 * 4. Weekly personal plans and training goals
 */

import { getMockWeeklySchedule, mockSearchFitBaseClientByPhone } from './fitbaseMock';

export type FunctionalTestType = 'leg_strength' | 'balance' | 'mobility' | 'endurance';

export interface FunctionalTestInput {
	testType: FunctionalTestType;
	testDate: string; // YYYY-MM-DD
	painReported: boolean;
	painNotes?: string;
	modifications?: string;

	// Leg strength fields
	wallSitSeconds?: number;
	squatsReps?: number;

	// Balance fields
	balanceSeconds?: number;
	balanceSide?: 'left' | 'right' | 'both';

	// Mobility fields
	mobilityReachCm?: number;
	mobilityJoint?: string;

	// Endurance fields
	enduranceSeconds?: number;
	heartRateBpm?: number;
}

export interface ClientProfileRecord {
	telegram_id: string;
	fitbase_client_id: string | null;
	phone_number: string | null;
	first_name: string;
	last_name: string;
	birth_date: string | null;
	gender: string | null;
	height_cm: number | null;
	weight_kg: number | null;
	fitness_goal: string;
	initial_fitness_level: string;
	membership_status: string;
	membership_card_number: string | null;
	membership_expires_at: string | null;
	club_location: string;
	created_at: number;
	updated_at: number;
}

export interface PersonalWeeklyPlanRecord {
	id: string;
	telegram_id: string;
	week_start_date: string;
	target_boxing_sessions: number;
	target_strength_sessions: number;
	target_cardio_minutes: number;
	completed_boxing_sessions: number;
	completed_strength_sessions: number;
	completed_cardio_minutes: number;
	coach_recommendation: string | null;
}

/**
 * Gets or creates client profile for authenticated Telegram user.
 */
export async function getOrCreateClientProfile(
	db: D1Database,
	telegramId: string,
	firstName: string,
	lastName: string
): Promise<ClientProfileRecord> {
	let profile = await db
		.prepare(`SELECT * FROM client_profiles WHERE telegram_id = ?`)
		.bind(telegramId)
		.first<ClientProfileRecord>();

	if (!profile) {
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare(
				`INSERT INTO client_profiles
				(telegram_id, first_name, last_name, fitness_goal, initial_fitness_level, membership_status, club_location, created_at, updated_at)
				VALUES (?, ?, ?, 'boxing_conditioning', 'intermediate', 'trial', 'Mayweather Boxing + Fitness (Tashkent)', ?, ?)`
			)
			.bind(telegramId, firstName, lastName, now, now)
			.run();

		profile = await db
			.prepare(`SELECT * FROM client_profiles WHERE telegram_id = ?`)
			.bind(telegramId)
			.first<ClientProfileRecord>();
	}

	return profile!;
}

/**
 * Links verified phone number to FitBase client record.
 */
export async function linkFitBaseToClientProfile(
	db: D1Database,
	telegramId: string,
	phone: string
): Promise<ClientProfileRecord> {
	const fitbaseContact = await mockSearchFitBaseClientByPhone(phone);
	const now = Math.floor(Date.now() / 1000);

	if (fitbaseContact) {
		await db
			.prepare(
				`UPDATE client_profiles
				SET fitbase_client_id = ?,
				    phone_number = ?,
				    membership_status = ?,
				    membership_card_number = ?,
				    membership_expires_at = ?,
				    birth_date = COALESCE(birth_date, ?),
				    gender = COALESCE(gender, ?),
				    club_location = ?,
				    updated_at = ?
				WHERE telegram_id = ?`
			)
			.bind(
				fitbaseContact.clientId,
				phone,
				fitbaseContact.membershipStatus,
				fitbaseContact.membershipCardNumber,
				fitbaseContact.membershipExpiresAt,
				fitbaseContact.birthDate,
				fitbaseContact.gender,
				fitbaseContact.clubLocation,
				now,
				telegramId
			)
			.run();
	} else {
		// No contract found in FitBase, update phone and set status
		await db
			.prepare(
				`UPDATE client_profiles
				SET phone_number = ?, membership_status = 'pending_linking', updated_at = ?
				WHERE telegram_id = ?`
			)
			.bind(phone, now, telegramId)
			.run();
	}

	const updated = await db
		.prepare(`SELECT * FROM client_profiles WHERE telegram_id = ?`)
		.bind(telegramId)
		.first<ClientProfileRecord>();

	return updated!;
}

/**
 * Records a functional test with strict validation against SQL check constraints.
 * Ensures fields of other test types are strictly null.
 */
export async function recordFunctionalTest(
	db: D1Database,
	telegramId: string,
	input: FunctionalTestInput
): Promise<{ success: boolean; id?: string; error?: string }> {
	const {
		testType,
		testDate,
		painReported,
		painNotes,
		modifications,
		wallSitSeconds,
		squatsReps,
		balanceSeconds,
		balanceSide,
		mobilityReachCm,
		mobilityJoint,
		enduranceSeconds,
		heartRateBpm
	} = input;

	if (!['leg_strength', 'balance', 'mobility', 'endurance'].includes(testType)) {
		return { success: false, error: 'Неизвестный тип функционального теста' };
	}

	// Validate test-specific fields and ensure others are null
	let cleanWallSit: number | null = null;
	let cleanSquats: number | null = null;
	let cleanBalanceSec: number | null = null;
	let cleanBalanceSide: string | null = null;
	let cleanMobilityReach: number | null = null;
	let cleanMobilityJoint: string | null = null;
	let cleanEnduranceSec: number | null = null;
	let cleanHeartRate: number | null = null;

	if (testType === 'leg_strength') {
		if (wallSitSeconds === undefined && squatsReps === undefined) {
			return { success: false, error: 'Для теста силы ног укажите время стульчика или количество приседаний' };
		}
		cleanWallSit = wallSitSeconds ?? null;
		cleanSquats = squatsReps ?? null;
	} else if (testType === 'balance') {
		if (balanceSeconds === undefined || balanceSeconds <= 0) {
			return { success: false, error: 'Для теста баланса укажите время удержания в секундах' };
		}
		cleanBalanceSec = balanceSeconds;
		cleanBalanceSide = balanceSide ?? 'both';
	} else if (testType === 'mobility') {
		if (mobilityReachCm === undefined) {
			return { success: false, error: 'Для теста подвижности укажите результат теста (см)' };
		}
		cleanMobilityReach = mobilityReachCm;
		cleanMobilityJoint = mobilityJoint ?? 'shoulder_and_hamstring';
	} else if (testType === 'endurance') {
		if (enduranceSeconds === undefined && heartRateBpm === undefined) {
			return { success: false, error: 'Для теста выносливости укажите время или пульс' };
		}
		cleanEnduranceSec = enduranceSeconds ?? null;
		cleanHeartRate = heartRateBpm ?? null;
	}

	const recordId = crypto.randomUUID();

	try {
		await db
			.prepare(
				`INSERT INTO functional_test_records (
					id, telegram_id, test_type, test_date, pain_reported, pain_notes, modifications,
					wall_sit_seconds, squats_reps, balance_seconds, balance_side,
					mobility_reach_cm, mobility_joint, endurance_seconds, heart_rate_bpm
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				recordId,
				telegramId,
				testType,
				testDate,
				painReported ? 1 : 0,
				painNotes ?? null,
				modifications ?? null,
				cleanWallSit,
				cleanSquats,
				cleanBalanceSec,
				cleanBalanceSide,
				cleanMobilityReach,
				cleanMobilityJoint,
				cleanEnduranceSec,
				cleanHeartRate
			)
			.run();

		return { success: true, id: recordId };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Ошибка сохранения теста';
		return { success: false, error: `SQL constraint violation: ${message}` };
	}
}

/**
 * Retrieves functional test history for user.
 */
export async function getFunctionalTestsHistory(db: D1Database, telegramId: string) {
	const results = await db
		.prepare(
			`SELECT * FROM functional_test_records
			WHERE telegram_id = ?
			ORDER BY test_date DESC, created_at DESC`
		)
		.bind(telegramId)
		.all();

	return results.results ?? [];
}

/**
 * Initializes or syncs schedule cache from mock FitBase.
 */
export async function syncScheduleFromFitBase(db: D1Database) {
	const mockClasses = getMockWeeklySchedule();
	for (const item of mockClasses) {
		await db
			.prepare(
				`INSERT OR IGNORE INTO fitbase_schedule_cache
				(id, class_title, category, trainer_name, start_time, end_time, duration_minutes, room, available_spots, total_spots, intensity_level)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				item.id,
				item.classTitle,
				item.category,
				item.trainerName,
				item.startTime,
				item.endTime,
				item.durationMinutes,
				item.room,
				item.availableSpots,
				item.totalSpots,
				item.intensityLevel
			)
			.run();
	}
}

/**
 * Gets upcoming schedule and user bookings.
 */
export async function getClassesScheduleWithBookings(db: D1Database, telegramId: string) {
	await syncScheduleFromFitBase(db);

	const classesResult = await db
		.prepare(
			`SELECT s.*, 
			        (b.id IS NOT NULL) as is_booked,
			        b.status as booking_status
			FROM fitbase_schedule_cache s
			LEFT JOIN client_workout_bookings b 
			  ON s.id = b.schedule_id AND b.telegram_id = ? AND b.status = 'booked'
			ORDER BY s.start_time ASC`
		)
		.bind(telegramId)
		.all();

	return classesResult.results ?? [];
}

/**
 * Books a workout session.
 */
export async function bookWorkoutClass(
	db: D1Database,
	telegramId: string,
	scheduleId: string
): Promise<{ success: boolean; error?: string }> {
	const scheduleSlot = await db
		.prepare(`SELECT * FROM fitbase_schedule_cache WHERE id = ?`)
		.bind(scheduleId)
		.first<any>();

	if (!scheduleSlot) {
		return { success: false, error: 'Тренировка не найдена' };
	}

	if (scheduleSlot.available_spots <= 0) {
		return { success: false, error: 'Все места на данную тренировку заняты' };
	}

	const bookingId = crypto.randomUUID();

	try {
		await db.batch([
			db
				.prepare(
					`INSERT INTO client_workout_bookings
					(id, telegram_id, schedule_id, class_title, trainer_name, start_time, end_time, status)
					VALUES (?, ?, ?, ?, ?, ?, ?, 'booked')`
				)
				.bind(
					bookingId,
					telegramId,
					scheduleId,
					scheduleSlot.class_title,
					scheduleSlot.trainer_name,
					scheduleSlot.start_time,
					scheduleSlot.end_time
				),
			db
				.prepare(`UPDATE fitbase_schedule_cache SET available_spots = available_spots - 1 WHERE id = ?`)
				.bind(scheduleId)
		]);

		return { success: true };
	} catch {
		return { success: false, error: 'Вы уже записаны на эту тренировку' };
	}
}

/**
 * Cancels a booked workout session.
 */
export async function cancelWorkoutBooking(
	db: D1Database,
	telegramId: string,
	scheduleId: string
): Promise<{ success: boolean; error?: string }> {
	const existing = await db
		.prepare(
			`SELECT * FROM client_workout_bookings
			WHERE telegram_id = ? AND schedule_id = ? AND status = 'booked'`
		)
		.bind(telegramId, scheduleId)
		.first();

	if (!existing) {
		return { success: false, error: 'Активная запись не найдена' };
	}

	await db.batch([
		db
			.prepare(
				`UPDATE client_workout_bookings SET status = 'cancelled'
				WHERE telegram_id = ? AND schedule_id = ?`
			)
			.bind(telegramId, scheduleId),
		db
			.prepare(`UPDATE fitbase_schedule_cache SET available_spots = available_spots + 1 WHERE id = ?`)
			.bind(scheduleId)
	]);

	return { success: true };
}

/**
 * Gets or creates weekly personal fitness plan.
 */
export async function getOrCreateWeeklyPlan(
	db: D1Database,
	telegramId: string,
	weekStartDate: string
): Promise<PersonalWeeklyPlanRecord> {
	let plan = await db
		.prepare(
			`SELECT * FROM personal_weekly_plans
			WHERE telegram_id = ? AND week_start_date = ?`
		)
		.bind(telegramId, weekStartDate)
		.first<PersonalWeeklyPlanRecord>();

	if (!plan) {
		const planId = crypto.randomUUID();
		const recommendation =
			'Фокус недели: постановка удара на дальней дистанции, баланс ног и 15-минутная работа на скакалке каждый день.';

		await db
			.prepare(
				`INSERT INTO personal_weekly_plans
				(id, telegram_id, week_start_date, target_boxing_sessions, target_strength_sessions, target_cardio_minutes, coach_recommendation)
				VALUES (?, ?, ?, 3, 2, 90, ?)`
			)
			.bind(planId, telegramId, weekStartDate, recommendation)
			.run();

		plan = await db
			.prepare(
				`SELECT * FROM personal_weekly_plans
				WHERE id = ?`
			)
			.bind(planId)
			.first<PersonalWeeklyPlanRecord>();
	}

	return plan!;
}
