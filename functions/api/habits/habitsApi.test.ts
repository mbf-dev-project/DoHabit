import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from './index';
import { onRequestPut, onRequestDelete } from './[id]/index';
import { onRequestPost as onRequestProgress } from './[id]/progress';
import { onRequestPost as onRequestToggleYesterday } from './[id]/toggle-yesterday';
import { onRequestPatch as onRequestArchive } from './[id]/archive';
import { getTashkentDate, getTashkentYesterday } from '../../lib/habitsService';

const TEST_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz_DUMMY_TOKEN';

interface MockUser {
	id: string;
	username?: string | null;
	first_name: string;
	last_name: string;
	language_code: string;
}

interface MockHabit {
	id: string;
	user_id: string;
	title: string;
	frequency: number;
	current_progress: number;
	last_activity_date: string;
	color_index: number;
	icon_title: string;
	sort_order: number;
	is_archived: number;
	created_at: number;
	updated_at: number;
}

interface MockCompletion {
	id: number;
	habit_id: string;
	user_id: string;
	completed_date: string;
	is_yesterday_used: number;
	created_at: number;
}

/**
 * Creates an in-memory D1Database mock that implements the queries used by our habits Pages Functions.
 */
function createMockD1Database(shouldThrow = false) {
	const users = new Map<string, MockUser>();
	const habits = new Map<string, MockHabit>();
	const completions: MockCompletion[] = [];
	let completionAutoId = 1;

	const db = {
		users,
		habits,
		completions,
		shouldThrow,
		prepare(sql: string) {
			return {
				bind(...params: any[]) {
					return {
						async run() {
							if (db.shouldThrow) throw new Error('Simulated D1 Error');
							return db.executeSql(sql, params, 'run');
						},
						async first<T = any>() {
							if (db.shouldThrow) throw new Error('Simulated D1 Error');
							const res = db.executeSql(sql, params, 'first');
							return (res ?? null) as T | null;
						},
						async all<T = any>() {
							if (db.shouldThrow) throw new Error('Simulated D1 Error');
							const results = db.executeSql(sql, params, 'all');
							return { results: (results ?? []) as T[], success: true };
						}
					};
				}
			};
		},
		async batch(statements: any[]) {
			if (db.shouldThrow) throw new Error('Simulated D1 Error');
			const results = [];
			for (const stmt of statements) {
				results.push(await stmt.run());
			}
			return results;
		},
		executeSql(sql: string, params: any[], mode: 'run' | 'first' | 'all'): any {
			const cleanSql = sql.replace(/\s+/g, ' ').trim();

			// 1. INSERT INTO users ... ON CONFLICT
			if (cleanSql.includes('INSERT INTO users')) {
				const [id, username, first_name, last_name, language_code] = params;
				users.set(id, { id, username, first_name, last_name, language_code });
				return { success: true };
			}

			// 2. SELECT * FROM habits WHERE user_id = ?
			if (cleanSql.startsWith('SELECT * FROM habits WHERE user_id = ?')) {
				const [userId] = params;
				const userHabits = Array.from(habits.values())
					.filter((h) => h.user_id === userId)
					.sort((a, b) => a.is_archived - b.is_archived || a.sort_order - b.sort_order || b.created_at - a.created_at);
				return userHabits;
			}

			// 3. SELECT * FROM habits WHERE id = ? AND user_id = ?
			if (cleanSql.startsWith('SELECT * FROM habits WHERE id = ? AND user_id = ?') || cleanSql.startsWith('SELECT id FROM habits WHERE id = ? AND user_id = ?')) {
				const [id, userId] = params;
				const habit = habits.get(id);
				if (habit && habit.user_id === userId) {
					return habit;
				}
				return null;
			}

			// 4. INSERT INTO habits
			if (cleanSql.includes('INSERT INTO habits')) {
				const [id, user_id, title, frequency, today, color_index, icon_title, sort_order, nowMs1, nowMs2] = params;
				const newHabit: MockHabit = {
					id,
					user_id,
					title,
					frequency,
					current_progress: 0,
					last_activity_date: today,
					color_index,
					icon_title,
					sort_order,
					is_archived: 0,
					created_at: nowMs1,
					updated_at: nowMs2
				};
				habits.set(id, newHabit);
				return { success: true };
			}

			// 5. UPDATE habits ... WHERE id = ? AND user_id = ?
			if (cleanSql.startsWith('UPDATE habits SET title = ?')) {
				const [title, frequency, current_progress, color_index, icon_title, sort_order, updated_at, id, userId] = params;
				const habit = habits.get(id);
				if (habit && habit.user_id === userId) {
					Object.assign(habit, { title, frequency, current_progress, color_index, icon_title, sort_order, updated_at });
				}
				return { success: true };
			}

			if (cleanSql.includes('UPDATE habits SET current_progress = ?')) {
				const [current_progress, last_activity_date, updated_at, id, userId] = params;
				const habit = habits.get(id);
				if (habit && habit.user_id === userId) {
					Object.assign(habit, { current_progress, last_activity_date, updated_at });
				}
				return { success: true };
			}

			if (cleanSql.includes('UPDATE habits SET is_archived = ?')) {
				const [is_archived, updated_at, id, userId] = params;
				const habit = habits.get(id);
				if (habit && habit.user_id === userId) {
					Object.assign(habit, { is_archived, updated_at });
				}
				return { success: true };
			}

			// 6. DELETE habits
			if (cleanSql.startsWith('DELETE FROM habits WHERE id = ? AND user_id = ?')) {
				const [id, userId] = params;
				const habit = habits.get(id);
				if (habit && habit.user_id === userId) {
					habits.delete(id);
				}
				return { success: true };
			}

			// 7. SELECT completions
			if (cleanSql.startsWith('SELECT') && cleanSql.includes('WHERE habit_id = ? AND user_id = ? AND completed_date = ?')) {
				const [habitId, userId, date] = params;
				const found = completions.find((c) => c.habit_id === habitId && c.user_id === userId && c.completed_date === date);
				return found ?? null;
			}

			if (cleanSql.startsWith('SELECT') && cleanSql.includes('WHERE habit_id = ? AND user_id = ?')) {
				const [habitId, userId] = params;
				return completions
					.filter((c) => c.habit_id === habitId && c.user_id === userId)
					.sort((a, b) => b.completed_date.localeCompare(a.completed_date));
			}

			if (cleanSql.startsWith('SELECT') && cleanSql.includes('FROM habit_completions WHERE user_id = ?')) {
				const [userId] = params;
				return completions
					.filter((c) => c.user_id === userId)
					.sort((a, b) => b.completed_date.localeCompare(a.completed_date));
			}

			// 8. INSERT completion
			if (cleanSql.startsWith('INSERT INTO habit_completions')) {
				const [habitId, userId, completedDate] = params;
				const isYesterday = cleanSql.includes(', 1, unixepoch()') ? 1 : 0;
				const exists = completions.some((c) => c.habit_id === habitId && c.completed_date === completedDate);
				if (!exists) {
					completions.push({
						id: completionAutoId++,
						habit_id: habitId,
						user_id: userId,
						completed_date: completedDate,
						is_yesterday_used: isYesterday,
						created_at: Math.floor(Date.now() / 1000)
					});
				}
				return { success: true };
			}

			// 9. DELETE completion
			if (cleanSql.startsWith('DELETE FROM habit_completions WHERE habit_id = ? AND user_id = ? AND completed_date = ?')) {
				const [habitId, userId, date] = params;
				const idx = completions.findIndex((c) => c.habit_id === habitId && c.user_id === userId && c.completed_date === date);
				if (idx !== -1) completions.splice(idx, 1);
				return { success: true };
			}

			if (cleanSql.startsWith('DELETE FROM habit_completions WHERE habit_id = ? AND user_id = ?')) {
				const [habitId, userId] = params;
				for (let i = completions.length - 1; i >= 0; i--) {
					if (completions[i].habit_id === habitId && completions[i].user_id === userId) {
						completions.splice(i, 1);
					}
				}
				return { success: true };
			}

			return { success: true };
		}
	};

	return db as any;
}

/**
 * Creates a valid Authorization header for testing.
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
	const signingKey = await crypto.subtle.importKey('raw', secretKeyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sigBuffer = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(dataCheckString));
	const hash = Array.from(new Uint8Array(sigBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	params.set('hash', hash);
	return `tma ${params.toString()}`;
}

describe('Habits API (Pages Functions + D1)', () => {
	let mockDb: any;
	let user1Auth: string;
	let user2Auth: string;

	beforeEach(async () => {
		mockDb = createMockD1Database();
		user1Auth = await createTestAuthHeader(1001, 'Floyd');
		user2Auth = await createTestAuthHeader(2002, 'Conor');
	});

	function createContext(request: Request, db = mockDb, botToken?: string, params: any = {}) {
		const token = arguments.length >= 3 ? botToken : TEST_BOT_TOKEN;
		return {
			request,
			env: { DB: db, TELEGRAM_BOT_TOKEN: token },
			params,
			data: {},
			waitUntil: () => {},
			next: async () => new Response(),
			functionPath: ''
		} as any;
	}

	describe('Authentication & Security', () => {
		it('should reject requests with missing authorization (401)', async () => {
			const req = new Request('https://mayweather.app/api/habits');
			const res = await onRequestGet(createContext(req));
			expect(res.status).toBe(401);
			const data: any = await res.json();
			expect(data.error).toContain('Missing Telegram authentication header');
		});

		it('should reject requests with invalid signature (401)', async () => {
			const req = new Request('https://mayweather.app/api/habits', {
				headers: { Authorization: 'tma auth_date=12345&hash=badhash&user={"id":1}' }
			});
			const res = await onRequestGet(createContext(req));
			expect(res.status).toBe(401);
		});

		it('should reject requests when server TELEGRAM_BOT_TOKEN is missing (401)', async () => {
			const req = new Request('https://mayweather.app/api/habits', {
				headers: { Authorization: user1Auth }
			});
			const res = await onRequestGet(createContext(req, mockDb, undefined));
			expect(res.status).toBe(401);
			const data: any = await res.json();
			expect(data.error).toContain('TELEGRAM_BOT_TOKEN is not configured');
		});
	});

	describe('POST /api/habits (Create Habit)', () => {
		it('should create a habit with valid payload and return 201', async () => {
			const req = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: {
					Authorization: user1Auth,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					title: 'Shadowboxing 15 mins',
					frequency: 3,
					colorIndex: 2,
					iconTitle: 'boxing'
				})
			});

			const res = await onRequestPost(createContext(req));
			expect(res.status).toBe(201);
			const habit: any = await res.json();

			expect(habit.id).toBeDefined();
			expect(habit.title).toBe('Shadowboxing 15 mins');
			expect(habit.frequency).toBe(3);
			expect(habit.currentProgress).toBe(0);
			expect(habit.colorIndex).toBe(2);
			expect(habit.iconTitle).toBe('boxing');
			expect(habit.isArchived).toBe(false);
			expect(habit.completedDays).toEqual([]);

			// Verify user upsert in DB
			expect(mockDb.users.has('1001')).toBe(true);
		});

		it('should reject habit creation with empty title (400)', async () => {
			const req = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: {
					Authorization: user1Auth,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					title: '   ',
					frequency: 1
				})
			});

			const res = await onRequestPost(createContext(req));
			expect(res.status).toBe(400);
			const data: any = await res.json();
			expect(data.error).toContain('Title is required');
		});

		it('should reject invalid frequency (< 1 or > 100) (400)', async () => {
			const req = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: {
					Authorization: user1Auth,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					title: 'Jump Rope',
					frequency: 0
				})
			});

			const res = await onRequestPost(createContext(req));
			expect(res.status).toBe(400);
			const data: any = await res.json();
			expect(data.error).toContain('Frequency must be an integer between 1 and 100');
		});
	});

	describe('GET /api/habits & Multi-Tenant Isolation', () => {
		it('should return habits belonging ONLY to the authenticated user', async () => {
			// Create habit for User 1
			const req1 = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Floyd Habit' })
			});
			await onRequestPost(createContext(req1));

			// Create habit for User 2
			const req2 = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user2Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Conor Habit' })
			});
			await onRequestPost(createContext(req2));

			// User 1 fetches habits
			const getReq1 = new Request('https://mayweather.app/api/habits', {
				headers: { Authorization: user1Auth }
			});
			const res1 = await onRequestGet(createContext(getReq1));
			const habitsUser1: any = await res1.json();

			expect(habitsUser1).toHaveLength(1);
			expect(habitsUser1[0].title).toBe('Floyd Habit');

			// User 2 fetches habits
			const getReq2 = new Request('https://mayweather.app/api/habits', {
				headers: { Authorization: user2Auth }
			});
			const res2 = await onRequestGet(createContext(getReq2));
			const habitsUser2: any = await res2.json();

			expect(habitsUser2).toHaveLength(1);
			expect(habitsUser2[0].title).toBe('Conor Habit');
		});
	});

	describe('PUT /api/habits/:id & DELETE /api/habits/:id', () => {
		it('should prevent User 2 from updating or deleting User 1 habit (404 Isolation)', async () => {
			// User 1 creates habit
			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Secret Habit' })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const createdHabit: any = await createRes.json();

			// User 2 tries to update User 1 habit
			const putReq = new Request(`https://mayweather.app/api/habits/${createdHabit.id}`, {
				method: 'PUT',
				headers: { Authorization: user2Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Hacked Title' })
			});
			const putRes = await onRequestPut(createContext(putReq, mockDb, TEST_BOT_TOKEN, { id: createdHabit.id }));
			expect(putRes.status).toBe(404);

			// User 2 tries to delete User 1 habit
			const delReq = new Request(`https://mayweather.app/api/habits/${createdHabit.id}`, {
				method: 'DELETE',
				headers: { Authorization: user2Auth }
			});
			const delRes = await onRequestDelete(createContext(delReq, mockDb, TEST_BOT_TOKEN, { id: createdHabit.id }));
			expect(delRes.status).toBe(404);

			// User 1 successfully updates habit
			const user1PutReq = new Request(`https://mayweather.app/api/habits/${createdHabit.id}`, {
				method: 'PUT',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Updated Title', frequency: 2 })
			});
			const user1PutRes = await onRequestPut(createContext(user1PutReq, mockDb, TEST_BOT_TOKEN, { id: createdHabit.id }));
			expect(user1PutRes.status).toBe(200);
			const updated: any = await user1PutRes.json();
			expect(updated.title).toBe('Updated Title');
			expect(updated.frequency).toBe(2);

			// User 1 successfully deletes habit
			const user1DelReq = new Request(`https://mayweather.app/api/habits/${createdHabit.id}`, {
				method: 'DELETE',
				headers: { Authorization: user1Auth }
			});
			const user1DelRes = await onRequestDelete(createContext(user1DelReq, mockDb, TEST_BOT_TOKEN, { id: createdHabit.id }));
			expect(user1DelRes.status).toBe(200);
			expect(mockDb.habits.has(createdHabit.id)).toBe(false);
		});
	});

	describe('POST /api/habits/:id/progress (Progress, Frequency, Toggle, LongPress)', () => {
		it('should complete habit with frequency = 1 on first click and toggle off on second click', async () => {
			const today = getTashkentDate(0);

			// Create habit with frequency = 1
			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Morning Run', frequency: 1 })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const habit: any = await createRes.json();

			// First click: completes habit
			const progReq1 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const progRes1 = await onRequestProgress(createContext(progReq1, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const habitAfter1: any = await progRes1.json();

			expect(habitAfter1.currentProgress).toBe(1);
			expect(habitAfter1.completedDays).toHaveLength(1);
			expect(habitAfter1.completedDays[0].date).toBe(today);

			// Second click: toggles completion off
			const progReq2 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const progRes2 = await onRequestProgress(createContext(progReq2, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const habitAfter2: any = await progRes2.json();

			expect(habitAfter2.currentProgress).toBe(0);
			expect(habitAfter2.completedDays).toHaveLength(0);
		});

		it('should track partial progress when frequency > 1 and complete when target is reached', async () => {
			const today = getTashkentDate(0);

			// Create habit with frequency = 3 (e.g. 3 boxing rounds)
			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Heavy Bag 3 Rounds', frequency: 3 })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const habit: any = await createRes.json();

			// Click 1: progress = 1, completedDays = 0
			const req1 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res1 = await onRequestProgress(createContext(req1, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h1: any = await res1.json();
			expect(h1.currentProgress).toBe(1);
			expect(h1.completedDays).toHaveLength(0);

			// Click 2: progress = 2, completedDays = 0
			const req2 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res2 = await onRequestProgress(createContext(req2, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h2: any = await res2.json();
			expect(h2.currentProgress).toBe(2);
			expect(h2.completedDays).toHaveLength(0);

			// Click 3: progress = 3, completedDays = 1 (complete!)
			const req3 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res3 = await onRequestProgress(createContext(req3, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h3: any = await res3.json();
			expect(h3.currentProgress).toBe(3);
			expect(h3.completedDays).toHaveLength(1);
			expect(h3.completedDays[0].date).toBe(today);

			// Click 4: toggle off
			const req4 = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res4 = await onRequestProgress(createContext(req4, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h4: any = await res4.json();
			expect(h4.currentProgress).toBe(0);
			expect(h4.completedDays).toHaveLength(0);
		});

		it('should immediately complete habit on long-press without toggling off if already completed', async () => {
			const today = getTashkentDate(0);

			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Pushups', frequency: 5 })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const habit: any = await createRes.json();

			// Long press: max out progress to frequency
			const longPressReq = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ isLongPress: true })
			});
			const res = await onRequestProgress(createContext(longPressReq, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h: any = await res.json();

			expect(h.currentProgress).toBe(5);
			expect(h.completedDays).toHaveLength(1);
			expect(h.completedDays[0].date).toBe(today);

			// Subsequent long press should NOT toggle off
			const secondLongPressReq = new Request(`https://mayweather.app/api/habits/${habit.id}/progress`, {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ isLongPress: true })
			});
			const resStay = await onRequestProgress(createContext(secondLongPressReq, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const hStay: any = await resStay.json();
			expect(hStay.currentProgress).toBe(5);
			expect(hStay.completedDays).toHaveLength(1);
		});
	});

	describe('POST /api/habits/:id/toggle-yesterday', () => {
		it('should toggle yesterday completion on and off', async () => {
			const yesterday = getTashkentYesterday();

			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Daily Sparring' })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const habit: any = await createRes.json();

			// Toggle on
			const toggleReq1 = new Request(`https://mayweather.app/api/habits/${habit.id}/toggle-yesterday`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res1 = await onRequestToggleYesterday(createContext(toggleReq1, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h1: any = await res1.json();

			expect(h1.completedDays).toHaveLength(1);
			expect(h1.completedDays[0].date).toBe(yesterday);
			expect(h1.completedDays[0].isCompYdayBtnUsed).toBe(true);

			// Toggle off
			const toggleReq2 = new Request(`https://mayweather.app/api/habits/${habit.id}/toggle-yesterday`, {
				method: 'POST',
				headers: { Authorization: user1Auth }
			});
			const res2 = await onRequestToggleYesterday(createContext(toggleReq2, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const h2: any = await res2.json();

			expect(h2.completedDays).toHaveLength(0);
		});
	});

	describe('PATCH /api/habits/:id/archive', () => {
		it('should archive and restore habit', async () => {
			const createReq = new Request('https://mayweather.app/api/habits', {
				method: 'POST',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Old Exercise' })
			});
			const createRes = await onRequestPost(createContext(createReq));
			const habit: any = await createRes.json();

			// Archive
			const arcReq = new Request(`https://mayweather.app/api/habits/${habit.id}/archive`, {
				method: 'PATCH',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ isArchived: true })
			});
			const arcRes = await onRequestArchive(createContext(arcReq, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const hArchived: any = await arcRes.json();
			expect(hArchived.isArchived).toBe(true);

			// Restore
			const unarcReq = new Request(`https://mayweather.app/api/habits/${habit.id}/archive`, {
				method: 'PATCH',
				headers: { Authorization: user1Auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ isArchived: false })
			});
			const unarcRes = await onRequestArchive(createContext(unarcReq, mockDb, TEST_BOT_TOKEN, { id: habit.id }));
			const hRestored: any = await unarcRes.json();
			expect(hRestored.isArchived).toBe(false);
		});
	});

	describe('Database Error Handling (500)', () => {
		it('should handle database exceptions safely and return 500 without leaking internals', async () => {
			const failingDb = createMockD1Database(true);

			const req = new Request('https://mayweather.app/api/habits', {
				headers: { Authorization: user1Auth }
			});
			const res = await onRequestGet(createContext(req, failingDb));
			expect(res.status).toBe(500);
			const data: any = await res.json();
			expect(data.error).toBe('Internal Server Error');
		});
	});
});
