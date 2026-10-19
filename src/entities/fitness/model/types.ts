export type FitnessTab = 'profile' | 'schedule' | 'plan';

export interface ClientProfile {
	telegram_id: string;
	fitbase_client_id: string | null;
	phone_number: string | null;
	first_name: string;
	last_name: string;
	birth_date: string | null;
	gender: 'male' | 'female' | 'other' | null;
	height_cm: number | null;
	weight_kg: number | null;
	fitness_goal: string;
	initial_fitness_level: string;
	membership_status: 'active' | 'inactive' | 'trial' | 'pending_linking';
	membership_card_number: string | null;
	membership_expires_at: string | null;
	club_location: string;
}

export type FunctionalTestType = 'leg_strength' | 'balance' | 'mobility' | 'endurance';

export interface FunctionalTestRecord {
	id: string;
	telegram_id: string;
	test_type: FunctionalTestType;
	test_date: string;
	pain_reported: number;
	pain_notes: string | null;
	modifications: string | null;
	wall_sit_seconds: number | null;
	squats_reps: number | null;
	balance_seconds: number | null;
	balance_side: 'left' | 'right' | 'both' | null;
	mobility_reach_cm: number | null;
	mobility_joint: string | null;
	endurance_seconds: number | null;
	heart_rate_bpm: number | null;
	created_at: number;
}

export interface ClassScheduleSlot {
	id: string;
	class_title: string;
	category: 'boxing' | 'strength' | 'conditioning';
	trainer_name: string;
	start_time: string;
	end_time: string;
	duration_minutes: number;
	room: string;
	available_spots: number;
	total_spots: number;
	intensity_level: 'all_levels' | 'medium' | 'high';
	is_booked?: number | boolean;
	booking_status?: 'booked' | 'cancelled' | null;
}

export interface PersonalWeeklyPlan {
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

export interface OtpState {
	requestId: string | null;
	phoneNumber: string;
	expiresInSeconds: number;
	mockCodeForTesting: string | null;
	isCodeSent: boolean;
	isVerifying: boolean;
	sessionToken: string | null;
	error: string | null;
}
