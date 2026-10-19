-- Migration: 0001_initial_schema.sql
-- Database: mayweather-habits-db
-- Description: Create initial schema for Telegram users, habits, and daily completion logs.

-- 1. Users table (authenticated via Telegram Mini App initData)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                            -- Telegram user ID as string
    username TEXT,                                 -- Telegram username without @
    first_name TEXT NOT NULL DEFAULT '',           -- User first name
    last_name TEXT NOT NULL DEFAULT '',            -- User last name
    language_code TEXT NOT NULL DEFAULT 'ru',      -- Interface language code
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), -- First seen timestamp (seconds)
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())  -- Last active timestamp (seconds)
);

-- 2. Habits table
CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,                            -- UUID identifier
    user_id TEXT NOT NULL,                          -- Foreign key to users(id)
    title TEXT NOT NULL,                            -- Habit / exercise title
    frequency INTEGER NOT NULL DEFAULT 1,           -- Target daily repetitions
    current_progress INTEGER NOT NULL DEFAULT 0,    -- Today's current progress count
    last_activity_date TEXT NOT NULL DEFAULT '',    -- ISO date of last progress update (YYYY-MM-DD)
    color_index INTEGER NOT NULL DEFAULT 0,         -- Palette color index
    icon_title TEXT NOT NULL DEFAULT 'boxing',      -- Icon identifier
    sort_order INTEGER NOT NULL DEFAULT 0,          -- UI sort order position
    is_archived INTEGER NOT NULL DEFAULT 0,         -- Archive flag (0 = active, 1 = archived)
    created_at INTEGER NOT NULL,                    -- Creation timestamp in ms
    updated_at INTEGER NOT NULL,                    -- Last update timestamp in ms
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (id, user_id)                            -- Composite unique key for multi-tenant isolation
);

-- 3. Habit completions table (daily historical records)
CREATE TABLE IF NOT EXISTS habit_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id TEXT NOT NULL,                         -- Habit UUID
    user_id TEXT NOT NULL,                          -- Owner Telegram user ID
    completed_date TEXT NOT NULL,                   -- ISO date string (YYYY-MM-DD)
    is_yesterday_used INTEGER NOT NULL DEFAULT 0,   -- 1 if completed via "Yesterday" button, 0 otherwise
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    -- Composite foreign key guarantees habit_completions.user_id ALWAYS matches habits.user_id:
    FOREIGN KEY (habit_id, user_id) REFERENCES habits(id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_habit_completion_date UNIQUE (habit_id, completed_date)
);

-- Indexes for fast retrieval of habits, streaks, and calendar views
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_completions_habit_date ON habit_completions(habit_id, completed_date DESC);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON habit_completions(user_id, completed_date);
