-- D1 Migration Schema for Mayweather Boxing + Fitness Client App & Habit Tracker
-- Combined reference schema (0001_initial_schema.sql + 0002_mayweather_fitness.sql)

-- 1. Users table (Telegram authenticated users)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                            -- Telegram user ID as string
    username TEXT,                                 -- Telegram username (without @)
    first_name TEXT NOT NULL DEFAULT '',           -- User first name
    last_name TEXT NOT NULL DEFAULT '',            -- User last name
    language_code TEXT NOT NULL DEFAULT 'ru',      -- User language code
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), -- First login timestamp (seconds)
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())  -- Last update timestamp (seconds)
);

-- 2. Habits table
CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,                            -- Habit UUID
    user_id TEXT NOT NULL,                          -- Owner Telegram user ID
    title TEXT NOT NULL,                            -- Habit title (e.g. "Shadowboxing 15m")
    frequency INTEGER NOT NULL DEFAULT 1,           -- Target completions per day
    current_progress INTEGER NOT NULL DEFAULT 0,    -- Today's current progress count
    last_activity_date TEXT NOT NULL DEFAULT '',    -- ISO date of last progress update (YYYY-MM-DD)
    color_index INTEGER NOT NULL DEFAULT 0,         -- Palette color index
    icon_title TEXT NOT NULL DEFAULT 'boxing',      -- Icon identifier
    sort_order INTEGER NOT NULL DEFAULT 0,          -- UI display order index
    is_archived INTEGER NOT NULL DEFAULT 0,         -- 0 = active, 1 = archived
    created_at INTEGER NOT NULL,                    -- Creation timestamp (ms)
    updated_at INTEGER NOT NULL,                    -- Last updated timestamp (ms)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (id, user_id)                            -- Composite unique key for multi-tenant isolation
);

-- 3. Habit completions table (historical daily logs)
CREATE TABLE IF NOT EXISTS habit_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id TEXT NOT NULL,                         -- Habit UUID
    user_id TEXT NOT NULL,                          -- Owner Telegram user ID
    completed_date TEXT NOT NULL,                   -- ISO date string: 'YYYY-MM-DD'
    is_yesterday_used INTEGER NOT NULL DEFAULT 0,   -- 1 if marked via "Yesterday" button, 0 otherwise
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    -- Composite foreign key guarantees habit_completions.user_id ALWAYS matches habits.user_id:
    FOREIGN KEY (habit_id, user_id) REFERENCES habits(id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_habit_completion_date UNIQUE (habit_id, completed_date)
);

-- Indexes for habits
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_completions_habit_date ON habit_completions(habit_id, completed_date DESC);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON habit_completions(user_id, completed_date);

-- 4. Client profiles (linked to Telegram user and FitBase)
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

-- 5. Temporary OTP verification storage for account linking
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

-- 6. Functional tests with strict SQL CHECK constraint excluding fields of other test types
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

-- 7. FitBase schedule classes cache / mock
CREATE TABLE IF NOT EXISTS fitbase_schedule_cache (
    id TEXT PRIMARY KEY,
    class_title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'boxing',
    trainer_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 50,
    room TEXT NOT NULL DEFAULT 'Boxing Ring & Bag Zone',
    available_spots INTEGER NOT NULL DEFAULT 16,
    total_spots INTEGER NOT NULL DEFAULT 16,
    intensity_level TEXT NOT NULL DEFAULT 'high',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 8. Client workout bookings
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

-- 9. Personal weekly fitness plans
CREATE TABLE IF NOT EXISTS personal_weekly_plans (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
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