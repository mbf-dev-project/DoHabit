/**
 * Mock FitBase API Service
 *
 * Implements read-only client lookup and schedule retrieval for Mayweather Boxing + Fitness.
 * Strictly uses mock data and does not make external network requests or store real personal data.
 */

export interface MockFitBaseContact {
	id: string;
	clientId: string;
	phone: string;
	firstName: string;
	lastName: string;
	birthDate: string;
	gender: 'male' | 'female' | 'other';
	membershipCardNumber: string;
	membershipStatus: 'active' | 'inactive' | 'trial';
	membershipExpiresAt: string;
	clubLocation: string;
	remainingVisits: number;
}

export interface MockScheduleItem {
	id: string;
	classTitle: string;
	category: 'boxing' | 'strength' | 'conditioning';
	trainerName: string;
	startTime: string; // ISO string
	endTime: string;   // ISO string
	durationMinutes: number;
	room: string;
	availableSpots: number;
	totalSpots: number;
	intensityLevel: 'all_levels' | 'medium' | 'high';
	description: string;
}

// Mock FitBase database of registered gym members
const MOCK_FITBASE_CONTACTS: MockFitBaseContact[] = [
	{
		id: 'fbc_101',
		clientId: 'fb_client_8801',
		phone: '+998901234567',
		firstName: 'Floyd',
		lastName: 'Member',
		birthDate: '1992-05-14',
		gender: 'male',
		membershipCardNumber: 'MBF-777-GOLD',
		membershipStatus: 'active',
		membershipExpiresAt: '2026-12-31',
		clubLocation: 'Mayweather Boxing + Fitness (Tashkent Central)',
		remainingVisits: 48
	},
	{
		id: 'fbc_102',
		clientId: 'fb_client_8802',
		phone: '+998909876543',
		firstName: 'Kamila',
		lastName: 'Fitness',
		birthDate: '1996-08-22',
		gender: 'female',
		membershipCardNumber: 'MBF-555-SILVER',
		membershipStatus: 'active',
		membershipExpiresAt: '2026-11-15',
		clubLocation: 'Mayweather Boxing + Fitness (Tashkent Central)',
		remainingVisits: 24
	}
];

/**
 * Normalizes phone numbers by removing spaces, dashes, parentheses.
 */
export function normalizePhoneNumber(rawPhone: string): string {
	const cleaned = rawPhone.replace(/[^\d+]/g, '');
	if (!cleaned.startsWith('+')) {
		if (cleaned.startsWith('998')) {
			return `+${cleaned}`;
		}
		if (cleaned.length === 9) {
			return `+998${cleaned}`;
		}
	}
	return cleaned;
}

/**
 * Mock FitBase client lookup by phone number.
 */
export async function mockSearchFitBaseClientByPhone(phone: string): Promise<MockFitBaseContact | null> {
	const normalized = normalizePhoneNumber(phone);
	const found = MOCK_FITBASE_CONTACTS.find((c) => normalizePhoneNumber(c.phone) === normalized);
	if (found) {
		return found;
	}

	// For demo / test runs with arbitrary valid phone format, generate a deterministic active membership
	if (normalized.length >= 10) {
		return {
			id: `fbc_gen_${normalized.slice(-4)}`,
			clientId: `fb_client_${normalized.slice(-4)}`,
			phone: normalized,
			firstName: 'Mayweather',
			lastName: 'Champion',
			birthDate: '1995-01-01',
			gender: 'male',
			membershipCardNumber: `MBF-${normalized.slice(-4)}-BLACK`,
			membershipStatus: 'active',
			membershipExpiresAt: '2026-12-31',
			clubLocation: 'Mayweather Boxing + Fitness (Tashkent Central)',
			remainingVisits: 36
		};
	}

	return null;
}

/**
 * Returns dynamic weekly schedule for Mayweather Boxing + Fitness.
 */
export function getMockWeeklySchedule(referenceDate = new Date()): MockScheduleItem[] {
	const schedule: MockScheduleItem[] = [];
	const categories: Array<'boxing' | 'strength' | 'conditioning'> = ['boxing', 'strength', 'conditioning'];

	// Generate schedule for 7 days starting from reference date
	for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
		const day = new Date(referenceDate);
		day.setDate(referenceDate.getDate() + dayOffset);
		const dayStr = day.toISOString().split('T')[0];

		// Class 1: 08:00 Morning Championship Rounds
		schedule.push({
			id: `sch_${dayStr}_0800`,
			classTitle: 'Championship Rounds',
			category: 'boxing',
			trainerName: 'Alex "The Hammer"',
			startTime: `${dayStr}T08:00:00.000Z`,
			endTime: `${dayStr}T08:50:00.000Z`,
			durationMinutes: 50,
			room: 'Ring & Bag Arena',
			availableSpots: 4,
			totalSpots: 16,
			intensityLevel: 'high',
			description: '12 rounds of authentic Mayweather boxing combinations paired with functional strength intervals.'
		});

		// Class 2: 12:30 Bag Work & Conditioning
		schedule.push({
			id: `sch_${dayStr}_1230`,
			classTitle: 'Bag Work & Conditioning',
			category: 'conditioning',
			trainerName: 'Rustam S.',
			startTime: `${dayStr}T12:30:00.000Z`,
			endTime: `${dayStr}T13:20:00.000Z`,
			durationMinutes: 50,
			room: 'Heavy Bag Studio',
			availableSpots: 8,
			totalSpots: 16,
			intensityLevel: 'medium',
			description: 'Cardio boxing intervals, heavy bag punches, head movement, and core blast.'
		});

		// Class 3: 18:30 Mayweather Strength & Power
		schedule.push({
			id: `sch_${dayStr}_1830`,
			classTitle: 'Mayweather Strength & Power',
			category: 'strength',
			trainerName: 'Farrukh T.',
			startTime: `${dayStr}T18:30:00.000Z`,
			endTime: `${dayStr}T19:20:00.000Z`,
			durationMinutes: 50,
			room: 'Functional Turf Zone',
			availableSpots: 2,
			totalSpots: 14,
			intensityLevel: 'high',
			description: 'Kettlebells, slam balls, battle ropes, and explosive plyometrics designed for boxers.'
		});

		// Class 4: 19:45 Speed & Agility / Fundamentals
		schedule.push({
			id: `sch_${dayStr}_1945`,
			classTitle: 'Speed & Agility Drills',
			category: 'boxing',
			trainerName: 'Alex "The Hammer"',
			startTime: `${dayStr}T19:45:00.000Z`,
			endTime: `${dayStr}T20:30:00.000Z`,
			durationMinutes: 45,
			room: 'Main Ring',
			availableSpots: 6,
			totalSpots: 12,
			intensityLevel: 'medium',
			description: 'Footwork ladders, jump rope rhythms, mittwork defense and counter-striking.'
		});
	}

	return schedule;
}
