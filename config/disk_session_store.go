package config

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type DiskSessionStore struct {
	db          *sql.DB
	stopCleanup chan struct{}
	stopOnce    sync.Once
}

func NewDiskSessionStore(databasePath string, cleanupInterval time.Duration) (*DiskSessionStore, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o755); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?cache=shared&mode=rwc&_pragma=busy_timeout(5000)", filepath.ToSlash(databasePath))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	store := &DiskSessionStore{db: db, stopCleanup: make(chan struct{})}
	if err := store.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if cleanupInterval > 0 {
		go store.startCleanup(cleanupInterval)
	}
	return store, nil
}

func (s *DiskSessionStore) initSchema() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			data BLOB NOT NULL,
			expiry INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expiry);
	`)
	return err
}

func (s *DiskSessionStore) Find(token string) ([]byte, bool, error) {
	var data []byte
	var expiry int64
	err := s.db.QueryRow(`SELECT data, expiry FROM sessions WHERE token = ?`, token).Scan(&data, &expiry)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if time.Now().UnixNano() > expiry {
		if err := s.Delete(token); err != nil {
			return nil, false, err
		}
		return nil, false, nil
	}
	return data, true, nil
}

func (s *DiskSessionStore) Commit(token string, data []byte, expiry time.Time) error {
	_, err := s.db.Exec(`INSERT INTO sessions (token, data, expiry)
		VALUES (?, ?, ?)
		ON CONFLICT(token) DO UPDATE SET data = excluded.data, expiry = excluded.expiry`,
		token, data, expiry.UnixNano())
	return err
}

func (s *DiskSessionStore) Delete(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *DiskSessionStore) All() (map[string][]byte, error) {
	rows, err := s.db.Query(`SELECT token, data FROM sessions WHERE expiry > ?`, time.Now().UnixNano())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := map[string][]byte{}
	for rows.Next() {
		var token string
		var data []byte
		if err := rows.Scan(&token, &data); err != nil {
			return nil, err
		}
		sessions[token] = data
	}
	return sessions, rows.Err()
}

func (s *DiskSessionStore) startCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			_, _ = s.db.Exec(`DELETE FROM sessions WHERE expiry <= ?`, time.Now().UnixNano())
		case <-s.stopCleanup:
			return
		}
	}
}

func (s *DiskSessionStore) Close() error {
	s.stopOnce.Do(func() {
		close(s.stopCleanup)
	})
	return s.db.Close()
}
