/**
 * Shared service functions for Mayweather habits API.
 * Handles database mapping, timezone-accurate date calculation (Asia/Tashkent),
 * and user upsert logic.
 */

import type { TelegramUser } from './telegramAuth';

export const TIMEZONE = 'Asia/Tashkent';

export interface CompletedDay {
	date: string;
	isCompYdayBtnUsed?: boolean;
}

export interface HabitResponse {
	id: string;
	title: string;
	frequency: number;
	currentProgress: number;
	lastActivityDate: string;
	colorIndex: number;
	iconTitle: string;
	sortOrder: number;
	isArchived: boolean;
	createdAt: number;
	completedDays: CompletedDay[];
}

export interface HabitInput {
	title: string;
	frequency?: number;
	colorIndex?: number;
	iconTitle?: string;
	sortOrder?: number;
}

/**
 * Returns the current date in Asia/Tashkent in 'YYYY-MM-DD' ISO format.
 */
export function getTashkentDate(offsetDays = 0): string {
	const now = new Date();
	if (offsetDays !== 0) {
		now.setDate(now.getDate() + offsetDays);
	}
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(now);
}

/**
 * Accurately returns yesterday's date in Asia/Tashkent in 'YYYY-MM-DD' format.
 */
export function getTashkentYesterday(): string {
	const todayStr = getTashkentDate(0);
	const [y, m, d] = todayStr.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	date.setUTCDate(date.getUTCDate() - 1);
	const yStr = date.getUTCFullYear();
	const mStr = String(date.getUTCMonth() + 1).padStart(2, '0');
	const dStr = String(date.getUTCDate()).padStart(2, '0');
	return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Upserts a verified Telegram user into the `users` table.
 */
export async function upsertTelegramUser(db: D1Database, user: TelegramUser): Promise<void> {
	const userIdStr = String(user.id);
	const username = user.username ?? null;
	const firstName = user.first_name || '';
	const lastName = user.last_name || '';
	const languageCode = user.language_code || 'ru';

	await db
		.prepare(
			`INSERT INTO users (id, username, first_name, last_name, language_code, updated_at)
			 VALUES (?, ?, ?, ?, ?, unixepoch())
			 ON CONFLICT(id) DO UPDATE SET
				username = excluded.username,
				first_name = excluded.first_name,
				last_name = excluded.last_name,
				language_code = excluded.language_code,
				updated_at = unixepoch()`
		)
		.bind(userIdStr, username, firstName, lastName, languageCode)
		.run();
}

/**
 * Validates habit input payload.
 */
export function validateHabitPayload(body: unknown, isPartial = false): {
	isValid: boolean;
	data?: HabitInput;
	error?: string;
} {
	if (!body || typeof body !== 'object') {
		return { isValid: false, error: 'Request body must be a JSON object' };
	}

	const record = body as Record<string, unknown>;

	if (!isPartial || 'title' in record) {
		if (typeof record.title !== 'string' || record.title.trim().length === 0) {
			return { isValid: false, error: 'Title is required and must be a non-empty string' };
		}
		if (record.title.trim().length > 100) {
			return { isValid: false, error: 'Title cannot exceed 100 characters' };
		}
	}

	if ('frequency' in record && record.frequency !== undefined) {
		const freq = Number(record.frequency);
		if (!Number.isInteger(freq) || freq < 1 || freq > 100) {
			return { isValid: false, error: 'Frequency must be an integer between 1 and 100' };
		}
	}

	if ('colorIndex' in record && record.colorIndex !== undefined) {
		const color = Number(record.colorIndex);
		if (!Number.isInteger(color) || color < 0 || color > 50) {
			return { isValid: false, error: 'Color index must be an integer between 0 and 50' };
		}
	}

	if ('iconTitle' in record && record.iconTitle !== undefined) {
		if (typeof record.iconTitle !== 'string' || record.iconTitle.trim().length === 0 || record.iconTitle.length > 50) {
			return { isValid: false, error: 'Icon title must be a non-empty string up to 50 characters' };
		}
	}

	if ('sortOrder' in record && record.sortOrder !== undefined) {
		const order = Number(record.sortOrder);
		if (!Number.isInteger(order) || order < 0) {
			return { isValid: false, error: 'Sort order must be a non-negative integer' };
		}
	}

	return {
		isValid: true,
		data: {
			title: typeof record.title === 'string' ? record.title.trim() : '',
			frequency: record.frequency !== undefined ? Number(record.frequency) : undefined,
			colorIndex: record.colorIndex !== undefined ? Number(record.colorIndex) : undefined,
			iconTitle: typeof record.iconTitle === 'string' ? record.iconTitle.trim() : undefined,
			sortOrder: record.sortOrder !== undefined ? Number(record.sortOrder) : undefined
		}
	};
}

/**
 * Assembles a DB habit row and its completions into a frontend-compatible Habit response.
 */
export function formatHabit(row: any, completions: any[]): HabitResponse {
	const today = getTashkentDate(0);
	const hasActivityToday = row.last_activity_date === today;

	// Normalize today's progress based on date
	const currentProgress = hasActivityToday ? row.current_progress : 0;

	return {
		id: row.id,
		title: row.title,
		frequency: row.frequency,
		currentProgress,
		lastActivityDate: row.last_activity_date || '',
		colorIndex: row.color_index,
		iconTitle: row.icon_title,
		sortOrder: row.sort_order ?? 0,
		isArchived: Boolean(row.is_archived),
		createdAt: row.created_at,
		completedDays: completions.map((c) => ({
			date: c.completed_date,
			...(c.is_yesterday_used ? { isCompYdayBtnUsed: true } : {})
		}))
	};
}
