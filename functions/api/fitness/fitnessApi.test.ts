import { beforeEach, describe, expect, it } from 'vitest';
import {
	createAccountLinkingOtp,
	verifyAccountLinkingOtp,
	consumeSessionToken,
	hashCodeWithSalt,
	computeOtpHmac,
	hashSessionToken,
	generateOtpCode,
	safeTimingEqual
} from '../../lib/accountLinkingService';
import {
	recordFunctionalTest,
	getFunctionalTestsHistory,
	getOrCreateClientProfile,
	linkFitBaseToClientProfile,
	bookWorkoutClass,
	cancelWorkoutBooking,
	getClassesScheduleWithBookings,
	getOrCreateWeeklyPlan
} from '../../lib/fitnessService';
import { onRequestPost as onRequestOtpRequest } from './otp/request';
import { onRequestPost as onRequestOtpVerify } from './otp/verify';

const TEST_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz_TEST_TOKEN';
const TEST_HMAC_SECRET = 'super-secret-otp-hmac-key-mayweather-test-12345';

/**
 * Helper to generate valid Telegram Mini App authorization header
 */
async function createTestAuthHeader(userId: number, firstName = 'Floyd', botToken = TEST_BOT_TOKEN): Promise<string> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const user = {
		id: userId,
		first_name: firstName,
		username: `user_${userId}`,
		language_code: 'en'
	};

	const params = new URLSearchParams({
		auth_date: String(nowSeconds),
		user: JSON.stringify(user)
	});

	const keys = Array.from(params.keys()).sort();
	const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

	const encoder = new TextEncoder();
	const webAppDataKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode('WebAppData'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const secretKeyBuffer = await crypto.subtle.sign('HMAC', webAppDataKey, encoder.encode(botToken));
	const signingKey = await crypto.subtle.importKey(
		'raw',
		secretKeyBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const sigBuffer = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(dataCheckString));
	const hash = Array.from(new Uint8Array(sigBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	params.set('hash', hash);
	return `tma ${params.toString()}`;
}

/**
 * In-memory Mock D1 Database simulating tables and constraints from:
 * migrations/0001_initial_schema.sql and migrations/0002_mayweather_fitness.sql
 */
function createMockD1Database() {
	const users = new Map<string, any>();
	const clientProfiles = new Map<string, any>();
	const otpRecords = new Map<string, any>();
	const functionalTests: any[] = [];
	const scheduleSlots = new Map<string, any>();
	const bookings = new Map<string, any>();
	const plans = new Map<string, any>();

	const db = {
		users,
		clientProfiles,
		otpRecords,
		functionalTests,
		scheduleSlots,
		bookings,
		plans,

		prepare(sql: string) {
			const cleanSql = sql.replace(/\s+/g, ' ').trim();
			return {
				bind(...params: any[]) {
					return {
						async run() {
							return db.execute(cleanSql, params, 'run');
						},
						async first<T = any>() {
							return db.execute(cleanSql, params, 'first') as T | null;
						},
						async all<T = any>() {
							const results = db.execute(cleanSql, params, 'all');
							return { results: (results ?? []) as T[], success: true };
						}
					};
				}
			};
		},

		async batch(statements: any[]) {
			const res = [];
			for (const s of statements) {
				res.push(await s.run());
			}
			return res;
		},

		execute(sql: string, params: any[], mode: 'run' | 'first' | 'all'): any {
			// 1. Client profile
			if (sql.startsWith('SELECT * FROM client_profiles WHERE telegram_id = ?')) {
				const [tid] = params;
				const prof = clientProfiles.get(tid);
				return mode === 'first' ? prof ?? null : [prof].filter(Boolean);
			}
			if (sql.startsWith('INSERT INTO client_profiles')) {
				const [telegram_id, first_name, last_name, now1, now2] = params;
				const prof = {
					telegram_id,
					first_name,
					last_name,
					fitness_goal: 'boxing_conditioning',
					initial_fitness_level: 'intermediate',
					membership_status: 'trial',
					club_location: 'Mayweather Boxing + Fitness (Tashkent)',
					height_cm: null,
					weight_kg: null,
					birth_date: null,
					gender: null,
					phone_number: null,
					membership_card_number: null,
					membership_expires_at: null,
					created_at: now1,
					updated_at: now2
				};
				clientProfiles.set(telegram_id, prof);
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.includes('UPDATE client_profiles SET fitbase_client_id = ?')) {
				const [fbcId, phone, status, cardNum, expAt, bDate, gender, club, now, tid] = params;
				const prof = clientProfiles.get(tid) || { telegram_id: tid };
				prof.fitbase_client_id = fbcId;
				prof.phone_number = phone;
				prof.membership_status = status;
				prof.membership_card_number = cardNum;
				prof.membership_expires_at = expAt;
				prof.birth_date = bDate;
				prof.gender = gender;
				prof.club_location = club;
				prof.updated_at = now;
				clientProfiles.set(tid, prof);
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}

			// 2. OTP records
			if (sql.startsWith('INSERT INTO account_linking_otp')) {
				const [id, telegram_id, phone_number, code_hash, salt, expires_at, created_at] = params;
				otpRecords.set(id, {
					id,
					telegram_id,
					phone_number,
					code_hash,
					salt,
					attempts_count: 0,
					max_attempts: 3,
					expires_at,
					used_at: null,
					session_token: null,
					session_expires_at: null,
					created_at
				});
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.startsWith('SELECT * FROM account_linking_otp WHERE id = ? AND telegram_id = ?')) {
				const [id, tid] = params;
				const rec = otpRecords.get(id);
				return rec && rec.telegram_id === tid ? rec : null;
			}
			if (sql.startsWith('SELECT * FROM account_linking_otp WHERE session_token = ? AND telegram_id = ?')) {
				const [token, tid] = params;
				for (const r of otpRecords.values()) {
					if (r.session_token === token && r.telegram_id === tid) {
						return r;
					}
				}
				return null;
			}
			if (sql.startsWith('UPDATE account_linking_otp SET attempts_count = ? WHERE id = ?')) {
				const [att, id] = params;
				const rec = otpRecords.get(id);
				if (rec) rec.attempts_count = att;
				return { success: true, meta: { changes: rec ? 1 : 0 }, changes: rec ? 1 : 0 };
			}
			if (sql.includes('SET used_at = ?, session_token = ?, session_expires_at = ?')) {
				const [usedAt, token, expAt, id, tid, nowSec] = params;
				const rec = otpRecords.get(id);
				if (
					rec &&
					rec.telegram_id === tid &&
					rec.used_at === null &&
					rec.attempts_count < rec.max_attempts &&
					rec.expires_at > (nowSec ?? 0)
				) {
					rec.used_at = usedAt;
					rec.session_token = token;
					rec.session_expires_at = expAt;
					return { success: true, meta: { changes: 1 }, changes: 1 };
				}
				return { success: true, meta: { changes: 0 }, changes: 0 };
			}
			if (sql.includes('session_expires_at = 0')) {
				const [id, tid, nowSec] = params;
				const rec = otpRecords.get(id);
				if (
					rec &&
					(!tid || rec.telegram_id === tid) &&
					rec.session_expires_at &&
					rec.session_expires_at > (nowSec ?? 0)
				) {
					rec.session_expires_at = 0;
					rec.session_token = null;
					return { success: true, meta: { changes: 1 }, changes: 1 };
				}
				return { success: true, meta: { changes: 0 }, changes: 0 };
			}

			// 3. Functional tests
			if (sql.startsWith('INSERT INTO functional_test_records')) {
				const [
					id,
					telegram_id,
					test_type,
					test_date,
					pain_reported,
					pain_notes,
					modifications,
					wall_sit,
					squats,
					balance_sec,
					balance_side,
					mobility_reach,
					mobility_joint,
					endurance_sec,
					heart_rate
				] = params;

				// Emulate SQL CHECK constraint: chk_test_type_fields
				if (test_type === 'leg_strength') {
					if (wall_sit === null && squats === null) {
						throw new Error('CHECK constraint failed: chk_test_type_fields (leg_strength requires wall_sit or squats)');
					}
					if (balance_sec !== null || balance_side !== null || mobility_reach !== null || endurance_sec !== null) {
						throw new Error('CHECK constraint failed: chk_test_type_fields (extraneous fields present)');
					}
				} else if (test_type === 'balance') {
					if (balance_sec === null || wall_sit !== null || squats !== null || mobility_reach !== null || endurance_sec !== null) {
						throw new Error('CHECK constraint failed: chk_test_type_fields (balance test constraint violation)');
					}
				} else if (test_type === 'mobility') {
					if (mobility_reach === null || wall_sit !== null || squats !== null || balance_sec !== null || endurance_sec !== null) {
						throw new Error('CHECK constraint failed: chk_test_type_fields (mobility test constraint violation)');
					}
				} else if (test_type === 'endurance') {
					if ((endurance_sec === null && heart_rate === null) || wall_sit !== null || balance_sec !== null || mobility_reach !== null) {
						throw new Error('CHECK constraint failed: chk_test_type_fields (endurance test constraint violation)');
					}
				}

				functionalTests.push({
					id,
					telegram_id,
					test_type,
					test_date,
					pain_reported,
					pain_notes,
					modifications,
					wall_sit_seconds: wall_sit,
					squats_reps: squats,
					balance_seconds: balance_sec,
					balance_side,
					mobility_reach_cm: mobility_reach,
					mobility_joint,
					endurance_seconds: endurance_sec,
					heart_rate_bpm: heart_rate
				});
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.startsWith('SELECT * FROM functional_test_records WHERE telegram_id = ?')) {
				const [tid] = params;
				return functionalTests.filter((t) => t.telegram_id === tid);
			}

			// 4. Schedule & bookings
			if (sql.startsWith('INSERT OR IGNORE INTO fitbase_schedule_cache')) {
				const [id, title, cat, trainer, st, et, dur, rm, av, tot, int] = params;
				if (!scheduleSlots.has(id)) {
					scheduleSlots.set(id, {
						id,
						class_title: title,
						category: cat,
						trainer_name: trainer,
						start_time: st,
						end_time: et,
						duration_minutes: dur,
						room: rm,
						available_spots: av,
						total_spots: tot,
						intensity_level: int
					});
				}
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.startsWith('SELECT * FROM fitbase_schedule_cache WHERE id = ?')) {
				const [id] = params;
				return scheduleSlots.get(id) ?? null;
			}
			if (sql.includes('FROM fitbase_schedule_cache s')) {
				const list = Array.from(scheduleSlots.values());
				return list.map((slot) => {
					let is_booked = 0;
					let booking_status = null;
					for (const b of bookings.values()) {
						if (b.schedule_id === slot.id && b.telegram_id === params[0] && b.status === 'booked') {
							is_booked = 1;
							booking_status = 'booked';
						}
					}
					return { ...slot, is_booked, booking_status };
				});
			}
			if (sql.startsWith('INSERT INTO client_workout_bookings')) {
				const [id, tid, sid, title, trainer, st, et] = params;
				bookings.set(id, {
					id,
					telegram_id: tid,
					schedule_id: sid,
					class_title: title,
					trainer_name: trainer,
					start_time: st,
					end_time: et,
					status: 'booked'
				});
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.startsWith('SELECT * FROM client_workout_bookings WHERE telegram_id = ? AND schedule_id = ? AND status = \'booked\'')) {
				const [tid, sid] = params;
				for (const b of bookings.values()) {
					if (b.telegram_id === tid && b.schedule_id === sid && b.status === 'booked') {
						return b;
					}
				}
				return null;
			}
			if (sql.startsWith('UPDATE client_workout_bookings SET status = \'cancelled\'')) {
				const [tid, sid] = params;
				for (const b of bookings.values()) {
					if (b.telegram_id === tid && b.schedule_id === sid) {
						b.status = 'cancelled';
					}
				}
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.includes('UPDATE fitbase_schedule_cache SET available_spots = available_spots - 1')) {
				const [id] = params;
				const slot = scheduleSlots.get(id);
				if (slot) slot.available_spots = Math.max(0, slot.available_spots - 1);
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.includes('UPDATE fitbase_schedule_cache SET available_spots = available_spots + 1')) {
				const [id] = params;
				const slot = scheduleSlots.get(id);
				if (slot) slot.available_spots = Math.min(slot.total_spots, slot.available_spots + 1);
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}

			// 5. Weekly plans
			if (sql.startsWith('SELECT * FROM personal_weekly_plans WHERE telegram_id = ? AND week_start_date = ?')) {
				const [tid, ws] = params;
				for (const p of plans.values()) {
					if (p.telegram_id === tid && p.week_start_date === ws) return p;
				}
				return null;
			}
			if (sql.startsWith('INSERT INTO personal_weekly_plans')) {
				const [id, tid, ws, rec] = params;
				const p = {
					id,
					telegram_id: tid,
					week_start_date: ws,
					target_boxing_sessions: 3,
					target_strength_sessions: 2,
					target_cardio_minutes: 90,
					completed_boxing_sessions: 2,
					completed_strength_sessions: 1,
					completed_cardio_minutes: 65,
					coach_recommendation: rec
				};
				plans.set(id, p);
				return { success: true, meta: { changes: 1 }, changes: 1 };
			}
			if (sql.startsWith('SELECT * FROM personal_weekly_plans WHERE id = ?')) {
				const [id] = params;
				return plans.get(id) ?? null;
			}

			return { success: true, meta: { changes: 1 }, changes: 1 };
		}
	};

	return db as unknown as D1Database;
}

describe('Mayweather Boxing + Fitness Integration Suite', () => {
	let mockDb: any;
	const TEST_TELEGRAM_ID = '987654321';

	beforeEach(() => {
		mockDb = createMockD1Database();
	});

	describe('Account Linking & OTP Verification Security', () => {
		it('should generate an OTP code that strictly consists of 6 digits', () => {
			for (let i = 0; i < 20; i++) {
				const code = generateOtpCode();
				expect(code).toMatch(/^\d{6}$/);
				const numeric = parseInt(code, 10);
				expect(numeric).toBeGreaterThanOrEqual(100000);
				expect(numeric).toBeLessThanOrEqual(999999);
			}
		});

		it('should reject verification input codes that do not have exactly 6 digits', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});

			const shortCode = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, req.otpRequestId!, '1234', {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(shortCode.success).toBe(false);
			expect(shortCode.error).toContain('ровно из 6 цифр');

			const alphaCode = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, req.otpRequestId!, 'abcdef', {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(alphaCode.success).toBe(false);
			expect(alphaCode.error).toContain('ровно из 6 цифр');
		});

		it('should store keyed HMAC-SHA256 with salt and NEVER store plain text OTP in D1', async () => {
			const res = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			expect(res.success).toBe(true);
			expect(res.otpRequestId).toBeDefined();
			expect(res.mockCodeForTesting).toMatch(/^\d{6}$/);

			// Inspect stored record directly from mock D1 database
			const stored = mockDb.otpRecords.get(res.otpRequestId);
			expect(stored).toBeDefined();
			expect(stored.code_hash).toHaveLength(64);
			expect(stored.salt).toHaveLength(32); // 16 bytes hex

			// Stored hash must strictly equal HMAC-SHA256(secret, code:salt)
			const expectedHmac = await computeOtpHmac(res.mockCodeForTesting!, stored.salt, TEST_HMAC_SECRET);
			expect(stored.code_hash).toBe(expectedHmac);

			// Plain text code must NEVER be stored anywhere in database
			expect(JSON.stringify(stored)).not.toContain(res.mockCodeForTesting);
		});

		it('should NEVER return OTP, hash, salt, or session token in production responses', async () => {
			const prodRes = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				isProduction: true,
				otpSecret: TEST_HMAC_SECRET,
				allowLocalMock: true // Mistakenly passed flag must be ignored in production
			});

			expect(prodRes.success).toBe(true);
			expect(prodRes.otpRequestId).toBeDefined();
			expect(prodRes.expiresInSeconds).toBe(300);

			// Strict assertion: mockCodeForTesting is undefined and no secrets are present
			expect(prodRes.mockCodeForTesting).toBeUndefined();
			expect((prodRes as any).code_hash).toBeUndefined();
			expect((prodRes as any).salt).toBeUndefined();
			expect((prodRes as any).session_token).toBeUndefined();
			expect((prodRes as any).sessionToken).toBeUndefined();
		});

		it('should NOT return mock code in non-production when allowLocalMock flag is absent or false', async () => {
			const resNoFlag = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: false,
				otpSecret: TEST_HMAC_SECRET
			});
			expect(resNoFlag.success).toBe(true);
			expect(resNoFlag.mockCodeForTesting).toBeUndefined();
		});

		it('should fail-closed in production if mock mode is mistakenly requested', async () => {
			const res = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				isProduction: true,
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			expect(res.mockCodeForTesting).toBeUndefined();
		});

		it('should fail-closed in production if OTP_HMAC_SECRET is missing', async () => {
			const res = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				isProduction: true,
				otpSecret: '' // Empty secret in production
			});
			expect(res.success).toBe(false);
			expect(res.error).toContain('отсутствует обязательный серверный ключ OTP_HMAC_SECRET');
		});

		it('should reject expired OTP code when 5-minute TTL has elapsed', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			const rec = mockDb.otpRecords.get(req.otpRequestId);
			// Artificially expire the record by setting expires_at into the past
			rec.expires_at = Math.floor(Date.now() / 1000) - 30;

			const verify = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, req.otpRequestId!, req.mockCodeForTesting!, {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(verify.success).toBe(false);
			expect(verify.error).toContain('Срок действия кода истёк');
		});

		it('should enforce attempt limits: reject after 3 failed attempts and block subsequent correct attempts', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			const reqId = req.otpRequestId!;

			// Attempt 1: wrong 6-digit code
			const r1 = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, '000000', { otpSecret: TEST_HMAC_SECRET });
			expect(r1.success).toBe(false);
			expect(r1.error).toContain('Осталось попыток: 2');

			// Attempt 2: wrong 6-digit code
			const r2 = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, '111111', { otpSecret: TEST_HMAC_SECRET });
			expect(r2.success).toBe(false);
			expect(r2.error).toContain('Осталось попыток: 1');

			// Attempt 3: wrong 6-digit code
			const r3 = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, '222222', { otpSecret: TEST_HMAC_SECRET });
			expect(r3.success).toBe(false);
			expect(r3.error).toContain('Лимит попыток исчерпан');

			// Attempt 4: even with the genuine correct code, must reject because attempts are exhausted
			const r4 = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, req.mockCodeForTesting!, {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(r4.success).toBe(false);
			expect(r4.error).toContain('Превышен лимит попыток');
		});

		it('should provide replay attack protection: verified code cannot be used a second time', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			const reqId = req.otpRequestId!;
			const code = req.mockCodeForTesting!;

			// First verification succeeds
			const firstVerify = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, code, {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(firstVerify.success).toBe(true);
			expect(firstVerify.sessionToken).toBeDefined();

			// Second verification with same code must be rejected
			const secondVerify = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, code, {
				otpSecret: TEST_HMAC_SECRET
			});
			expect(secondVerify.success).toBe(false);
			expect(secondVerify.error).toContain('Код уже был использован (повторная отправка отклонена)');
		});

		it('should prevent concurrent requests from redeeming the same OTP code twice (atomic CAS in D1)', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			const reqId = req.otpRequestId!;
			const code = req.mockCodeForTesting!;

			// Simulate two concurrent parallel verification requests
			const [res1, res2] = await Promise.all([
				verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, code, { otpSecret: TEST_HMAC_SECRET }),
				verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, reqId, code, { otpSecret: TEST_HMAC_SECRET })
			]);

			// Exactly one must succeed, and the other must fail due to atomic single consumption
			const successes = [res1, res2].filter((r) => r.success);
			const failures = [res1, res2].filter((r) => !r.success);

			expect(successes).toHaveLength(1);
			expect(failures).toHaveLength(1);
			expect(failures[0].error).toMatch(/Код уже был использован/);
		});

		it('should store session token in D1 only as SHA-256 hash and ensure single-use guarantee', async () => {
			const req = await createAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, '+998901234567', {
				allowLocalMock: true,
				otpSecret: TEST_HMAC_SECRET
			});
			const verify = await verifyAccountLinkingOtp(mockDb, TEST_TELEGRAM_ID, req.otpRequestId!, req.mockCodeForTesting!, {
				otpSecret: TEST_HMAC_SECRET
			});
			const rawSessionToken = verify.sessionToken!;
			expect(rawSessionToken).toBeDefined();

			// Verify that the record in D1 stores only the SHA-256 hash of the session token
			const rec = mockDb.otpRecords.get(req.otpRequestId);
			const expectedHashedToken = await hashSessionToken(rawSessionToken);
			expect(rec.session_token).toBe(expectedHashedToken);
			expect(rec.session_token).not.toBe(rawSessionToken);

			// First consumption succeeds
			const c1 = await consumeSessionToken(mockDb, TEST_TELEGRAM_ID, rawSessionToken);
			expect(c1.success).toBe(true);
			expect(c1.phoneNumber).toBe('+998901234567');

			// Second consumption of same token fails (single use)
			const c2 = await consumeSessionToken(mockDb, TEST_TELEGRAM_ID, rawSessionToken);
			expect(c2.success).toBe(false);
			expect(c2.error).toContain('Недействительный или отсутствующий токен сессии');
		});

		it('should verify constant-time comparison helper safeTimingEqual', () => {
			const encoder = new TextEncoder();
			const b1 = encoder.encode('secret_hash_value_1234567890abcdef');
			const b2 = encoder.encode('secret_hash_value_1234567890abcdef');
			const b3 = encoder.encode('secret_hash_value_1234567890abcdeg'); // 1 char diff
			const bShort = encoder.encode('short');

			expect(safeTimingEqual(b1, b2)).toBe(true);
			expect(safeTimingEqual(b1, b3)).toBe(false);
			expect(safeTimingEqual(b1, bShort)).toBe(false);
		});
	});

	describe('HTTP Endpoint Protection: /api/fitness/otp/request & /api/fitness/otp/verify', () => {
		it('should safely refuse OTP issuance when SMS delivery is unconfigured and mock mode is off', async () => {
			const authHeader = await createTestAuthHeader(12345, 'Floyd');
			const request = new Request('https://mayweather.app/api/fitness/otp/request', {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ phoneNumber: '+998901234567' })
			});

			// No ENABLE_LOCAL_OTP_MOCK flag
			const res = await onRequestOtpRequest({
				request,
				env: {
					DB: mockDb,
					TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
					OTP_HMAC_SECRET: TEST_HMAC_SECRET
				}
			} as any);

			expect(res.status).toBe(503);
			const data: any = await res.json();
			expect(data.error).toContain('Сервис доставки SMS не подключён');
			expect(data.mockCodeForTesting).toBeUndefined();
		});

		it('should return mock code only when local mock mode is explicitly enabled in non-production', async () => {
			const authHeader = await createTestAuthHeader(12345, 'Floyd');
			const request = new Request('https://mayweather.app/api/fitness/otp/request', {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ phoneNumber: '+998901234567' })
			});

			const res = await onRequestOtpRequest({
				request,
				env: {
					DB: mockDb,
					TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
					OTP_HMAC_SECRET: TEST_HMAC_SECRET,
					ENVIRONMENT: 'development',
					ENABLE_LOCAL_OTP_MOCK: 'true'
				}
			} as any);

			expect(res.status).toBe(200);
			const data: any = await res.json();
			expect(data.success).toBe(true);
			expect(data.mockCodeForTesting).toMatch(/^\d{6}$/);
			// NEVER leak hash or salt to client
			expect(data.code_hash).toBeUndefined();
			expect(data.salt).toBeUndefined();
		});

		it('should fail-closed in production even if ENABLE_LOCAL_OTP_MOCK is accidentally set to true', async () => {
			const authHeader = await createTestAuthHeader(12345, 'Floyd');
			const request = new Request('https://mayweather.app/api/fitness/otp/request', {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ phoneNumber: '+998901234567' })
			});

			const res = await onRequestOtpRequest({
				request,
				env: {
					DB: mockDb,
					TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
					OTP_HMAC_SECRET: TEST_HMAC_SECRET,
					ENVIRONMENT: 'production',
					ENABLE_LOCAL_OTP_MOCK: 'true' // Erroneous flag in production
				}
			} as any);

			// In production with mock flag, mock mode is strictly prohibited -> safe refusal 503
			expect(res.status).toBe(503);
			const data: any = await res.json();
			expect(data.error).toContain('Сервис доставки SMS не подключён');
			expect(data.mockCodeForTesting).toBeUndefined();
		});
	});

	describe('Functional Test Constraints & Validation', () => {
		it('should record valid leg_strength test with wall_sit and squats, keeping other fields null', async () => {
			const res = await recordFunctionalTest(mockDb, TEST_TELEGRAM_ID, {
				testType: 'leg_strength',
				testDate: '2026-10-19',
				painReported: false,
				wallSitSeconds: 75,
				squatsReps: 45
			});

			expect(res.success).toBe(true);
			const history = await getFunctionalTestsHistory(mockDb, TEST_TELEGRAM_ID);
			expect(history.length).toBe(1);
			expect(history[0].wall_sit_seconds).toBe(75);
			expect(history[0].squats_reps).toBe(45);
			expect(history[0].balance_seconds).toBeNull();
			expect(history[0].mobility_reach_cm).toBeNull();
		});

		it('should record valid balance test and enforce absence of endurance/mobility/leg fields', async () => {
			const res = await recordFunctionalTest(mockDb, TEST_TELEGRAM_ID, {
				testType: 'balance',
				testDate: '2026-10-19',
				painReported: false,
				balanceSeconds: 42,
				balanceSide: 'right'
			});

			expect(res.success).toBe(true);
			const history = await getFunctionalTestsHistory(mockDb, TEST_TELEGRAM_ID);
			const balanceRecord = history.find((h: any) => h.test_type === 'balance');
			expect(balanceRecord.balance_seconds).toBe(42);
			expect(balanceRecord.balance_side).toBe('right');
			expect(balanceRecord.wall_sit_seconds).toBeNull();
			expect(balanceRecord.mobility_reach_cm).toBeNull();
		});

		it('should reject leg strength test missing required measurement fields', async () => {
			const res = await recordFunctionalTest(mockDb, TEST_TELEGRAM_ID, {
				testType: 'leg_strength',
				testDate: '2026-10-19',
				painReported: false
			});

			expect(res.success).toBe(false);
			expect(res.error).toContain('укажите время стульчика или количество приседаний');
		});
	});

	describe('FitBase Mock & Client Profile Linking', () => {
		it('should link verified phone to active FitBase club membership', async () => {
			await getOrCreateClientProfile(mockDb, TEST_TELEGRAM_ID, 'Floyd', 'Member');
			const updated = await linkFitBaseToClientProfile(mockDb, TEST_TELEGRAM_ID, '+998901234567');

			expect(updated.membership_status).toBe('active');
			expect(updated.membership_card_number).toBe('MBF-777-GOLD');
			expect(updated.club_location).toContain('Mayweather Boxing + Fitness');
		});

		it('should query mock schedule, book a class, and decrement available spots', async () => {
			const schedule = await getClassesScheduleWithBookings(mockDb, TEST_TELEGRAM_ID);
			expect(schedule.length).toBeGreaterThan(0);

			const targetClass = schedule[0];
			const initialSpots = targetClass.available_spots;

			// Book class
			const bookRes = await bookWorkoutClass(mockDb, TEST_TELEGRAM_ID, targetClass.id);
			expect(bookRes.success).toBe(true);

			// Check updated schedule reflects booking and decremented spots
			const afterBooking = await getClassesScheduleWithBookings(mockDb, TEST_TELEGRAM_ID);
			const bookedItem = afterBooking.find((s: any) => s.id === targetClass.id);
			expect(bookedItem.is_booked).toBe(1);
			expect(bookedItem.available_spots).toBe(initialSpots - 1);

			// Cancel booking
			const cancelRes = await cancelWorkoutBooking(mockDb, TEST_TELEGRAM_ID, targetClass.id);
			expect(cancelRes.success).toBe(true);

			const afterCancel = await getClassesScheduleWithBookings(mockDb, TEST_TELEGRAM_ID);
			const cancelledItem = afterCancel.find((s: any) => s.id === targetClass.id);
			expect(cancelledItem.is_booked).toBe(0);
			expect(cancelledItem.available_spots).toBe(initialSpots);
		});

		it('should create personal weekly plan with coach recommendations', async () => {
			const plan = await getOrCreateWeeklyPlan(mockDb, TEST_TELEGRAM_ID, '2026-10-19');
			expect(plan.target_boxing_sessions).toBe(3);
			expect(plan.target_strength_sessions).toBe(2);
			expect(plan.coach_recommendation).toBeDefined();
		});
	});
});
