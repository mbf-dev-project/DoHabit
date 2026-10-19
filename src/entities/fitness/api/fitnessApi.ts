import type {
	ClientProfile,
	ClassScheduleSlot,
	FunctionalTestRecord,
	FunctionalTestType,
	PersonalWeeklyPlan
} from '../model/types';

// In browser preview, window.Telegram?.WebApp provides initData.
function getAuthHeader(): Record<string, string> {
	if (typeof window !== 'undefined') {
		const webApp = (window as any).Telegram?.WebApp;
		if (webApp?.initData) {
			return { Authorization: `tma ${webApp.initData}` };
		}
	}
	// Fallback mock header for local browser testing
	return { 'X-Telegram-Init-Data': 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Mayweather%22%2C%22last_name%22%3A%22Client%22%7D&auth_date=1770000000&hash=0000000000000000000000000000000000000000000000000000000000000000' };
}

export const fitnessApi = {
	async getProfile(): Promise<ClientProfile> {
		try {
			const res = await fetch('/api/fitness/profile', {
				headers: getAuthHeader()
			});
			if (res.ok) {
				const data = (await res.json()) as { profile: ClientProfile };
				return data.profile;
			}
		} catch {
			// Fallback to local default profile
		}

		return {
			telegram_id: '123456789',
			fitbase_client_id: 'fb_client_8801',
			phone_number: '+998901234567',
			first_name: 'Флойд',
			last_name: 'Мейвезер',
			birth_date: '1995-02-24',
			gender: 'male',
			height_cm: 178,
			weight_kg: 76.5,
			fitness_goal: 'boxing_conditioning',
			initial_fitness_level: 'advanced',
			membership_status: 'active',
			membership_card_number: 'MBF-777-GOLD',
			membership_expires_at: '2026-12-31',
			club_location: 'Mayweather Boxing + Fitness (Tashkent Central)'
		};
	},

	async updateProfile(updates: Partial<ClientProfile>): Promise<ClientProfile> {
		try {
			const res = await fetch('/api/fitness/profile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...getAuthHeader()
				},
				body: JSON.stringify(updates)
			});
			if (res.ok) {
				const data = (await res.json()) as { profile: ClientProfile };
				return data.profile;
			}
		} catch {
			// Local fallback
		}
		return updates as ClientProfile;
	},

	async requestOtp(phoneNumber: string): Promise<{ success: boolean; requestId?: string; mockCode?: string; error?: string }> {
		try {
			const res = await fetch('/api/fitness/otp/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...getAuthHeader()
				},
				body: JSON.stringify({ phoneNumber })
			});
			const data = await res.json();
			if (res.ok && data.success) {
				return {
					success: true,
					requestId: data.otpRequestId,
					mockCode: data.mockCodeForTesting
				};
			}
			return { success: false, error: data.error ?? 'Ошибка запроса кода' };
		} catch {
			// Simulated local OTP for offline browser development
			return {
				success: true,
				requestId: 'mock_req_123',
				mockCode: '7788'
			};
		}
	},

	async verifyOtp(otpRequestId: string, code: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
		try {
			const res = await fetch('/api/fitness/otp/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...getAuthHeader()
				},
				body: JSON.stringify({ otpRequestId, code })
			});
			const data = await res.json();
			if (res.ok && data.success) {
				return {
					success: true,
					sessionToken: data.sessionToken
				};
			}
			return { success: false, error: data.error ?? 'Неверный код' };
		} catch {
			// Simulated local success
			return {
				success: true,
				sessionToken: 'mock_session_token_xyz'
			};
		}
	},

	async linkAccount(sessionToken: string): Promise<{ success: boolean; profile?: ClientProfile; error?: string }> {
		try {
			const res = await fetch('/api/fitness/link-account', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...getAuthHeader()
				},
				body: JSON.stringify({ sessionToken })
			});
			const data = await res.json();
			if (res.ok && data.success) {
				return {
					success: true,
					profile: data.profile
				};
			}
			return { success: false, error: data.error ?? 'Ошибка привязки карты' };
		} catch {
			return {
				success: true,
				profile: {
					telegram_id: '123456789',
					fitbase_client_id: 'fb_client_8801',
					phone_number: '+998901234567',
					first_name: 'Флойд',
					last_name: 'Мейвезер',
					birth_date: '1995-02-24',
					gender: 'male',
					height_cm: 178,
					weight_kg: 76.5,
					fitness_goal: 'boxing_conditioning',
					initial_fitness_level: 'advanced',
					membership_status: 'active',
					membership_card_number: 'MBF-777-GOLD',
					membership_expires_at: '2026-12-31',
					club_location: 'Mayweather Boxing + Fitness (Tashkent Central)'
				}
			};
		}
	},

	async getSchedule(): Promise<ClassScheduleSlot[]> {
		try {
			const res = await fetch('/api/fitness/schedule', {
				headers: getAuthHeader()
			});
			if (res.ok) {
				const data = (await res.json()) as { schedule: ClassScheduleSlot[] };
				return data.schedule;
			}
		} catch {
			// Fallback
		}

		// Local mock schedule
		const today = new Date().toISOString().split('T')[0];
		return [
			{
				id: 'sch_1',
				class_title: 'Championship Rounds',
				category: 'boxing',
				trainer_name: 'Alex "The Hammer"',
				start_time: `${today}T08:00:00Z`,
				end_time: `${today}T08:50:00Z`,
				duration_minutes: 50,
				room: 'Main Boxing Ring',
				available_spots: 4,
				total_spots: 16,
				intensity_level: 'high',
				is_booked: 0
			},
			{
				id: 'sch_2',
				class_title: 'Bag Work & Conditioning',
				category: 'conditioning',
				trainer_name: 'Rustam S.',
				start_time: `${today}T12:30:00Z`,
				end_time: `${today}T13:20:00Z`,
				duration_minutes: 50,
				room: 'Heavy Bag Studio',
				available_spots: 7,
				total_spots: 16,
				intensity_level: 'medium',
				is_booked: 0
			},
			{
				id: 'sch_3',
				class_title: 'Mayweather Strength & Power',
				category: 'strength',
				trainer_name: 'Farrukh T.',
				start_time: `${today}T18:30:00Z`,
				end_time: `${today}T19:20:00Z`,
				duration_minutes: 50,
				room: 'Functional Turf Zone',
				available_spots: 2,
				total_spots: 14,
				intensity_level: 'high',
				is_booked: 0
			},
			{
				id: 'sch_4',
				class_title: 'Speed & Agility Footwork',
				category: 'boxing',
				trainer_name: 'Alex "The Hammer"',
				start_time: `${today}T19:45:00Z`,
				end_time: `${today}T20:30:00Z`,
				duration_minutes: 45,
				room: 'Speed Zone',
				available_spots: 5,
				total_spots: 12,
				intensity_level: 'medium',
				is_booked: 0
			}
		];
	},


	async getFunctionalTests(): Promise<FunctionalTestRecord[]> {
		try {
			const res = await fetch('/api/fitness/functional-tests', {
				headers: getAuthHeader()
			});
			if (res.ok) {
				const data = (await res.json()) as { tests: FunctionalTestRecord[] };
				return data.tests;
			}
		} catch {
			// Fallback
		}

		return [
			{
				id: 'ft_1',
				telegram_id: '123456789',
				test_type: 'leg_strength',
				test_date: '2026-10-15',
				pain_reported: 0,
				pain_notes: null,
				modifications: 'Базовая техника со стойкой у стены',
				wall_sit_seconds: 70,
				squats_reps: 42,
				balance_seconds: null,
				balance_side: null,
				mobility_reach_cm: null,
				mobility_joint: null,
				endurance_seconds: null,
				heart_rate_bpm: null,
				created_at: Date.now() - 86400000 * 4
			},
			{
				id: 'ft_2',
				telegram_id: '123456789',
				test_type: 'balance',
				test_date: '2026-10-16',
				pain_reported: 0,
				pain_notes: null,
				modifications: null,
				wall_sit_seconds: null,
				squats_reps: null,
				balance_seconds: 45,
				balance_side: 'right',
				mobility_reach_cm: null,
				mobility_joint: null,
				endurance_seconds: null,
				heart_rate_bpm: null,
				created_at: Date.now() - 86400000 * 3
			},
			{
				id: 'ft_3',
				telegram_id: '123456789',
				test_type: 'mobility',
				test_date: '2026-10-17',
				pain_reported: 0,
				pain_notes: null,
				modifications: null,
				wall_sit_seconds: null,
				squats_reps: null,
				balance_seconds: null,
				balance_side: null,
				mobility_reach_cm: 14.5,
				mobility_joint: 'Плечевой пояс и бицепс бедра',
				endurance_seconds: null,
				heart_rate_bpm: null,
				created_at: Date.now() - 86400000 * 2
			},
			{
				id: 'ft_4',
				telegram_id: '123456789',
				test_type: 'endurance',
				test_date: '2026-10-18',
				pain_reported: 0,
				pain_notes: null,
				modifications: '3-минутный степ-тест',
				wall_sit_seconds: null,
				squats_reps: null,
				balance_seconds: null,
				balance_side: null,
				mobility_reach_cm: null,
				mobility_joint: null,
				endurance_seconds: 180,
				heart_rate_bpm: 128,
				created_at: Date.now() - 86400000
			}
		];
	},

	async recordFunctionalTest(test: {
		testType: FunctionalTestType;
		testDate: string;
		painReported: boolean;
		painNotes?: string;
		modifications?: string;
		wallSitSeconds?: number;
		squatsReps?: number;
		balanceSeconds?: number;
		balanceSide?: 'left' | 'right' | 'both';
		mobilityReachCm?: number;
		mobilityJoint?: string;
		enduranceSeconds?: number;
		heartRateBpm?: number;
	}): Promise<{ success: boolean; tests?: FunctionalTestRecord[]; error?: string }> {
		try {
			const res = await fetch('/api/fitness/functional-tests', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...getAuthHeader()
				},
				body: JSON.stringify(test)
			});
			const data = await res.json();
			if (res.ok && data.success) {
				return { success: true, tests: data.tests };
			}
			return { success: false, error: data.error };
		} catch {
			return { success: true };
		}
	},

	async getWeeklyPlan(): Promise<PersonalWeeklyPlan> {
		try {
			const res = await fetch('/api/fitness/plan', {
				headers: getAuthHeader()
			});
			if (res.ok) {
				const data = (await res.json()) as { plan: PersonalWeeklyPlan };
				return data.plan;
			}
		} catch {
			// Fallback
		}

		return {
			id: 'plan_cur',
			telegram_id: '123456789',
			week_start_date: '2026-10-19',
			target_boxing_sessions: 3,
			target_strength_sessions: 2,
			target_cardio_minutes: 90,
			completed_boxing_sessions: 2,
			completed_strength_sessions: 1,
			completed_cardio_minutes: 65,
			coach_recommendation:
				'Фокус недели: постановка защитного движения плечом (Mayweather Shoulder Roll) и сохранение баланса ног при отходе назад.'
		};
	}
};
