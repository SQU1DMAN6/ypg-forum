package config

import (
	"database/sql"
	"time"

	_ "modernc.org/sqlite"
)

type Database struct {
	SQL *sql.DB
}

func OpenDatabase(path string) (*Database, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(time.Hour)
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Database{SQL: db}, nil
}

func migrate(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			handle TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL DEFAULT '' UNIQUE,
			password_hash TEXT NOT NULL DEFAULT '',
			profile_json TEXT NOT NULL DEFAULT '{}',
			settings_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY,
			author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			topic_json TEXT NOT NULL,
			score INTEGER NOT NULL DEFAULT 0,
			comment_count INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id TEXT PRIMARY KEY,
			post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			parent_id TEXT,
			body TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS follows (
			follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			followed_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (follower_id, followed_id)
		)`,
		`CREATE TABLE IF NOT EXISTS votes (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			post_id TEXT NOT NULL,
			direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
			updated_at TEXT NOT NULL,
			PRIMARY KEY (user_id, post_id)
		)`,
		`CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			participant_json TEXT NOT NULL,
			unread INTEGER NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			body TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			read INTEGER NOT NULL DEFAULT 1
		)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email <> ''`); err != nil {
		return err
	}
	return nil
}
