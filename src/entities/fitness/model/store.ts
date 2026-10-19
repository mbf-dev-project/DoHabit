import { create } from 'zustand';
import { fitnessApi } from '../api/fitnessApi';
import type {
	ClientProfile,
	ClassScheduleSlot,
	FunctionalTestRecord,
	FunctionalTestType,
	PersonalWeeklyPlan,
	FitnessTab
} from './types';

interface FitnessState {
	activeTab: FitnessTab;
	profile: ClientProfile | null;
	schedule: ClassScheduleSlot[];
	tests: FunctionalTestRecord[];
	plan: PersonalWeeklyPlan | null;
	isLoading: boolean;
	error: string | null;

	// OTP linking state
	otpRequestId: string | null;
	otpMockCode: string | null;
	isOtpSent: boolean;
	isLinking: boolean;
	otpError: string | null;

	// Actions
	setActiveTab: (tab: FitnessTab) => void;
	loadAllData: () => void;
	requestPhoneOtp: (phone: string) => Promise<boolean>;
	verifyAndLinkCard: (code: string) => Promise<boolean>;
	recordTest: (input: {
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
	}) => Promise<boolean>;
	updateProfileBiometrics: (updates: Partial<ClientProfile>) => Promise<void>;
}

export const useFitnessStore = create<FitnessState>((set, get) => ({
	activeTab: 'profile',
	profile: null,
	schedule: [],
	tests: [],
	plan: null,
	isLoading: false,
	error: null,

	otpRequestId: null,
	otpMockCode: null,
	isOtpSent: false,
	isLinking: false,
	otpError: null,

	setActiveTab: (tab) => set({ activeTab: tab }),

	loadAllData: async () => {
		set({ isLoading: true, error: null });
		try {
			const [profile, schedule, tests, plan] = await Promise.all([
				fitnessApi.getProfile(),
				fitnessApi.getSchedule(),
				fitnessApi.getFunctionalTests(),
				fitnessApi.getWeeklyPlan()
			]);
			set({ profile, schedule, tests, plan, isLoading: false });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Ошибка загрузки данных';
			set({ error: message, isLoading: false });
		}
	},

	requestPhoneOtp: async (phone: string) => {
		set({ isLinking: true, otpError: null });
		const res = await fitnessApi.requestOtp(phone);
		if (res.success && res.requestId) {
			set({
				isLinking: false,
				isOtpSent: true,
				otpRequestId: res.requestId,
				otpMockCode: res.mockCode ?? null
			});
			return true;
		}
		set({ isLinking: false, otpError: res.error ?? 'Ошибка отправки кода' });
		return false;
	},

	verifyAndLinkCard: async (code: string) => {
		const { otpRequestId } = get();
		if (!otpRequestId) {
			set({ otpError: 'Сначала запросите SMS-код' });
			return false;
		}

		set({ isLinking: true, otpError: null });
		const verifyRes = await fitnessApi.verifyOtp(otpRequestId, code);
		if (!verifyRes.success || !verifyRes.sessionToken) {
			set({ isLinking: false, otpError: verifyRes.error ?? 'Неверный код' });
			return false;
		}

		// Use single-use session token to link account
		const linkRes = await fitnessApi.linkAccount(verifyRes.sessionToken);
		if (linkRes.success && linkRes.profile) {
			set({
				isLinking: false,
				isOtpSent: false,
				otpRequestId: null,
				otpMockCode: null,
				profile: linkRes.profile
			});
			return true;
		}

		set({ isLinking: false, otpError: linkRes.error ?? 'Ошибка привязки клубной карты' });
		return false;
	},


	recordTest: async (input) => {
		const res = await fitnessApi.recordFunctionalTest(input);
		if (res.success) {
			if (res.tests) {
				set({ tests: res.tests });
			} else {
				// Refresh
				const freshTests = await fitnessApi.getFunctionalTests();
				set({ tests: freshTests });
			}
			return true;
		}
		return false;
	},

	updateProfileBiometrics: async (updates) => {
		const updated = await fitnessApi.updateProfile(updates);
		set({ profile: updated });
	}
}));
