-- Migration: 0002_mayweather_fitness.sql
-- Database: mayweather-habits-db
-- Description: Mayweather Boxing + Fitness Client MVP schema.
-- Includes client profiles, OTP verification temporary storage,
-- functional test results with strict type isolation constraints,
-- FitBase schedule cache, bookings, and weekly plans.

-- 1. Client profiles (linked to Telegram user and FitBase)
CREATE TABLE IF NOT EXISTS client_profiles (
    telegram_id TEXT PRIMARY KEY,
    fitbase_client_id TEXT,
    phone_number TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    birth_date TEXT,                                -- YYYY-MM-DD
    gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
    height_cm REAL,
    weight_kg REAL,
    fitness_goal TEXT NOT NULL DEFAULT 'boxing_conditioning',
    initial_fitness_level TEXT NOT NULL DEFAULT 'intermediate',
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'trial', 'pending_linking')),
    membership_card_number TEXT,
    membership_expires_at TEXT,                     -- YYYY-MM-DD
    club_location TEXT NOT NULL DEFAULT 'Mayweather Boxing + Fitness (Tashkent)',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (telegram_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Temporary OTP verification storage for account linking
-- Strictly isolated: stores hashed code, salt, attempts counter, expiration, and replay protection
CREATE TABLE IF NOT EXISTS account_linking_otp (
    id TEXT PRIMARY KEY,                            -- Verification request UUID
    telegram_id TEXT NOT NULL,                      -- Authenticated Telegram ID
    phone_number TEXT NOT NULL,                     -- Normalized phone number
    code_hash TEXT NOT NULL,                        -- SHA-256 hash of the code + salt
    salt TEXT NOT NULL,                             -- Random salt
    attempts_count INTEGER NOT NULL DEFAULT 0,      -- Number of incorrect tries
    max_attempts INTEGER NOT NULL DEFAULT 3,        -- Maximum allowed attempts before invalidation
    expires_at INTEGER NOT NULL,                    -- Expiration epoch in seconds
    used_at INTEGER,                                -- Timestamp when used (NULL = unused; prevents replay)
    session_token TEXT UNIQUE,                      -- Short-lived one-time session token issued upon success
    session_expires_at INTEGER,                     -- Session token expiration timestamp
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (telegram_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Functional tests with strict SQL CHECK constraint excluding fields of other test types
CREATE TABLE IF NOT EXISTS functional_test_records (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    test_type TEXT NOT NULL CHECK (test_type IN ('leg_strength', 'balance', 'mobility', 'endurance')),
    test_date TEXT NOT NULL,                        -- YYYY-MM-DD
    pain_reported INTEGER NOT NULL DEFAULT 0 CHECK (pain_reported IN (0, 1)),
    pain_notes TEXT,
    modifications TEXT,
    
    -- Leg strength fields
    wall_sit_seconds INTEGER,
    squats_reps INTEGER,
    
    -- Balance fields
    balance_seconds INTEGER,
    balance_side TEXT CHECK (balance_side IS NULL OR balance_side IN ('left', 'right', 'both')),
    
    -- Mobility fields
    mobility_reach_cm REAL,
    mobility_joint TEXT,
    
    -- Endurance fields
    endurance_seconds INTEGER,
    heart_rate_bpm INTEGER,
    
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (telegram_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Constraint enforcing that only fields belonging to test_type are populated
    CONSTRAINT chk_test_type_fields CHECK (
        (
            test_type = 'leg_strength'
            AND (wall_sit_seconds IS NOT NULL OR squats_reps IS NOT NULL)
            AND balance_seconds IS NULL
            AND balance_side IS NULL
            AND mobility_reach_cm IS NULL
            AND mobility_joint IS NULL
            AND endurance_seconds IS NULL
            AND heart_rate_bpm IS NULL
        )
        OR
        (
            test_type = 'balance'
            AND balance_seconds IS NOT NULL
            AND wall_sit_seconds IS NULL
            AND squats_reps IS NULL
            AND mobility_reach_cm IS NULL
            AND mobility_joint IS NULL
            AND endurance_seconds IS NULL
            AND heart_rate_bpm IS NULL
        )
        OR
        (
            test_type = 'mobility'
            AND mobility_reach_cm IS NOT NULL
            AND wall_sit_seconds IS NULL
            AND squats_reps IS NULL
            AND balance_seconds IS NULL
            AND balance_side IS NULL
            AND endurance_seconds IS NULL
            AND heart_rate_bpm IS NULL
        )
        OR
        (
            test_type = 'endurance'
            AND (endurance_seconds IS NOT NULL OR heart_rate_bpm IS NOT NULL)
            AND wall_sit_seconds IS NULL
            AND squats_reps IS NULL
            AND balance_seconds IS NULL
            AND balance_side IS NULL
            AND mobility_reach_cm IS NULL
            AND mobility_joint IS NULL
        )
    )
);

-- 4. FitBase schedule classes cache / mock
CREATE TABLE IF NOT EXISTS fitbase_schedule_cache (
    id TEXT PRIMARY KEY,                            -- FitBase Schedule Slot ID
    class_title TEXT NOT NULL,                      -- e.g. "Championship Rounds", "Bag Work"
    category TEXT NOT NULL DEFAULT 'boxing',        -- 'boxing', 'strength', 'conditioning'
    trainer_name TEXT NOT NULL,                     -- e.g. "Alex", "Rustam", "Farrukh"
    start_time TEXT NOT NULL,                       -- ISO DateTime string
    end_time TEXT NOT NULL,                         -- ISO DateTime string
    duration_minutes INTEGER NOT NULL DEFAULT 50,
    room TEXT NOT NULL DEFAULT 'Boxing Ring & Bag Zone',
    available_spots INTEGER NOT NULL DEFAULT 16,
    total_spots INTEGER NOT NULL DEFAULT 16,
    intensity_level TEXT NOT NULL DEFAULT 'high',   -- 'all_levels', 'medium', 'high'
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 5. Client workout bookings
CREATE TABLE IF NOT EXISTS client_workout_bookings (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    class_title TEXT NOT NULL,
    trainer_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (telegram_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES fitbase_schedule_cache(id) ON DELETE CASCADE,
    UNIQUE (telegram_id, schedule_id)
);

-- 6. Personal weekly fitness plans
CREATE TABLE IF NOT EXISTS personal_weekly_plans (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,                  -- YYYY-MM-DD (Monday)
    target_boxing_sessions INTEGER NOT NULL DEFAULT 3,
    target_strength_sessions INTEGER NOT NULL DEFAULT 2,
    target_cardio_minutes INTEGER NOT NULL DEFAULT 90,
    completed_boxing_sessions INTEGER NOT NULL DEFAULT 0,
    completed_strength_sessions INTEGER NOT NULL DEFAULT 0,
    completed_cardio_minutes INTEGER NOT NULL DEFAULT 0,
    coach_recommendation TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (telegram_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (telegram_id, week_start_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_otp_telegram ON account_linking_otp(telegram_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_token ON account_linking_otp(session_token);
CREATE INDEX IF NOT EXISTS idx_test_records_user ON functional_test_records(telegram_id, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON client_workout_bookings(telegram_id, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_time ON fitbase_schedule_cache(start_time);
