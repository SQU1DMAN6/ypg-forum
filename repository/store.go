package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Store struct {
	db *sql.DB
}

var defaultStore *Store

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func SetStore(store *Store) {
	defaultStore = store
}

func GetStore() *Store {
	return defaultStore
}

func (s *Store) EnsureSeedData() error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO users (id, handle, email, password_hash, profile_json, settings_json, created_at) VALUES (?, ?, '', '', '{}', '{}', ?)`, "you", "you", now)
	if err != nil {
		return err
	}
	defaults := []string{"futsali", "mhsthinker"}
	for _, followed := range defaults {
		if _, err := s.db.Exec(`INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES ('you', ?, ?)`, followed, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) State(userID string) (State, error) {
	state := State{
		Users:         []map[string]any{},
		Posts:         []map[string]any{},
		Comments:      map[string][]any{},
		Follows:       map[string][]string{},
		Votes:         map[string]any{},
		Profiles:      map[string]any{},
		Settings:      map[string]any{},
		Conversations: []map[string]any{},
	}
	var err error
	if state.Posts, err = s.Posts(); err != nil {
		return state, err
	}
	if state.Comments, err = s.Comments(); err != nil {
		return state, err
	}
	if state.Follows[userID], err = s.Follows(userID); err != nil {
		return state, err
	}
	if state.Votes, err = s.Votes(userID); err != nil {
		return state, err
	}
	profile, settings, err := s.AccountData(userID)
	if err != nil {
		return state, err
	}
	state.Profiles[userID] = profile
	state.Settings[userID] = settings
	if state.Conversations, err = s.Conversations(userID); err != nil {
		return state, err
	}
	return state, nil
}

func (s *Store) UpsertUserProfile(userID string, account map[string]any) error {
	handle := slug(asString(account["handle"]))
	if handle == "" {
		handle = userID
	}
	passwordHash := asString(account["passwordHash"])
	account["id"] = userID
	account["handle"] = handle
	delete(account, "passwordHash")
	body, err := json.Marshal(account)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO users (id, handle, email, password_hash, profile_json, settings_json, created_at)
		VALUES (?, ?, ?, ?, ?, '{}', ?)
		ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, email = excluded.email, password_hash = excluded.password_hash, profile_json = excluded.profile_json`,
		userID, handle, asString(account["email"]), passwordHash, string(body), time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *Store) Credentials(identifier string) (string, string, error) {
	var id, hash string
	err := s.db.QueryRow(`SELECT id, password_hash FROM users WHERE handle = ? OR email = ?`, identifier, identifier).Scan(&id, &hash)
	return id, hash, err
}

func (s *Store) AccountData(userID string) (map[string]any, map[string]any, error) {
	var profileJSON, settingsJSON string
	err := s.db.QueryRow(`SELECT profile_json, settings_json FROM users WHERE id = ?`, userID).Scan(&profileJSON, &settingsJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return map[string]any{}, map[string]any{}, nil
	}
	if err != nil {
		return nil, nil, err
	}
	return decodeObject(profileJSON), decodeObject(settingsJSON), nil
}

func (s *Store) SaveProfile(userID string, profile map[string]any) error {
	body, err := json.Marshal(profile)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE users SET profile_json = ? WHERE id = ?`, string(body), userID)
	return err
}

func (s *Store) SaveSettings(userID string, settings map[string]any) error {
	body, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE users SET settings_json = ? WHERE id = ?`, string(body), userID)
	return err
}

func (s *Store) Posts() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, author_id, title, body, topic_json, score, comment_count, created_at FROM posts ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := []map[string]any{}
	for rows.Next() {
		var id, authorID, title, body, topicJSON, createdAt string
		var score, commentCount int
		if err := rows.Scan(&id, &authorID, &title, &body, &topicJSON, &score, &commentCount, &createdAt); err != nil {
			return nil, err
		}
		posts = append(posts, map[string]any{
			"id": id, "authorId": authorID, "title": title, "body": body,
			"topicIds": decodeArray(topicJSON), "score": score, "comments": commentCount, "createdAt": createdAt,
		})
	}
	return posts, rows.Err()
}

func (s *Store) CreatePost(userID string, post map[string]any) (map[string]any, error) {
	id := asString(post["id"])
	if id == "" {
		id = "post-" + time.Now().UTC().Format("20060102150405")
	}
	topics, _ := json.Marshal(post["topicIds"])
	createdAt := asString(post["createdAt"])
	if createdAt == "" {
		createdAt = "Just now"
	}
	_, err := s.db.Exec(`INSERT OR REPLACE INTO posts (id, author_id, title, body, topic_json, score, comment_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, userID, asString(post["title"]), asString(post["body"]), string(topics), intValue(post["score"]), intValue(post["comments"]), createdAt)
	if err != nil {
		return nil, err
	}
	post["id"] = id
	post["authorId"] = userID
	post["createdAt"] = createdAt
	return post, nil
}

func (s *Store) Comments() (map[string][]any, error) {
	rows, err := s.db.Query(`SELECT id, post_id, author_id, parent_id, body, created_at FROM comments ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := map[string][]any{}
	for rows.Next() {
		var id, postID, authorID, body, createdAt string
		var parent sql.NullString
		if err := rows.Scan(&id, &postID, &authorID, &parent, &body, &createdAt); err != nil {
			return nil, err
		}
		comment := map[string]any{"id": id, "authorId": authorID, "parentId": nil, "body": body, "createdAt": createdAt}
		if parent.Valid {
			comment["parentId"] = parent.String
		}
		comments[postID] = append(comments[postID], comment)
	}
	return comments, rows.Err()
}

func (s *Store) AddComment(userID, postID string, comment map[string]any) ([]any, error) {
	id := asString(comment["id"])
	if id == "" {
		id = "comment-" + time.Now().UTC().Format("20060102150405")
	}
	createdAt := asString(comment["createdAt"])
	if createdAt == "" {
		createdAt = "Just now"
	}
	_, err := s.db.Exec(`INSERT OR REPLACE INTO comments (id, post_id, author_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, postID, userID, nullableString(comment["parentId"]), asString(comment["body"]), createdAt)
	if err != nil {
		return nil, err
	}
	_, _ = s.db.Exec(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`, postID)
	all, err := s.Comments()
	return all[postID], err
}

func (s *Store) Follows(userID string) ([]string, error) {
	rows, err := s.db.Query(`SELECT followed_id FROM follows WHERE follower_id = ? ORDER BY created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var follows []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		follows = append(follows, id)
	}
	return follows, rows.Err()
}

func (s *Store) ToggleFollow(userID, followedID string) ([]string, error) {
	if followedID == "" || followedID == userID {
		return s.Follows(userID)
	}
	var exists int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followed_id = ?`, userID, followedID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists > 0 {
		_, _ = s.db.Exec(`DELETE FROM follows WHERE follower_id = ? AND followed_id = ?`, userID, followedID)
	} else {
		_, _ = s.db.Exec(`INSERT INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)`, userID, followedID, time.Now().UTC().Format(time.RFC3339))
	}
	return s.Follows(userID)
}

func (s *Store) Votes(userID string) (map[string]any, error) {
	rows, err := s.db.Query(`SELECT post_id, direction FROM votes WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	votes := map[string]any{}
	for rows.Next() {
		var postID, direction string
		if err := rows.Scan(&postID, &direction); err != nil {
			return nil, err
		}
		votes[postID] = direction
	}
	return votes, rows.Err()
}

func (s *Store) ToggleVote(userID, postID, direction string) (map[string]any, error) {
	if direction != "up" && direction != "down" {
		return s.Votes(userID)
	}
	var current string
	err := s.db.QueryRow(`SELECT direction FROM votes WHERE user_id = ? AND post_id = ?`, userID, postID).Scan(&current)
	if err == nil && current == direction {
		_, _ = s.db.Exec(`DELETE FROM votes WHERE user_id = ? AND post_id = ?`, userID, postID)
	} else {
		_, _ = s.db.Exec(`INSERT INTO votes (user_id, post_id, direction, updated_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(user_id, post_id) DO UPDATE SET direction = excluded.direction, updated_at = excluded.updated_at`, userID, postID, direction, time.Now().UTC().Format(time.RFC3339))
	}
	return s.Votes(userID)
}

func (s *Store) ConvesationRows() {}

func (s *Store) Conversations(userID string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, participant_json, unread FROM conversations ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	conversations := []map[string]any{}
	for rows.Next() {
		var id, participants string
		var unread int
		if err := rows.Scan(&id, &participants, &unread); err != nil {
			return nil, err
		}
		if !strings.Contains(participants, userID) {
			continue
		}
		messages, err := s.messages(id)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, map[string]any{
			"id": id, "participantIds": decodeArray(participants), "unread": unread == 1, "messages": messages,
		})
	}
	return conversations, rows.Err()
}

func (s *Store) SaveConversations(conversations []map[string]any) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, conversation := range conversations {
		id := asString(conversation["id"])
		if id == "" {
			continue
		}
		participants, _ := json.Marshal(conversation["participantIds"])
		_, err := tx.Exec(`INSERT INTO conversations (id, participant_json, unread, updated_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET participant_json = excluded.participant_json, unread = excluded.unread, updated_at = excluded.updated_at`,
			id, string(participants), boolInt(conversation["unread"]), time.Now().UTC().Format(time.RFC3339))
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM messages WHERE conversation_id = ?`, id); err != nil {
			return err
		}
		for _, raw := range anySlice(conversation["messages"]) {
			message, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			_, err := tx.Exec(`INSERT INTO messages (id, conversation_id, sender_id, body, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)`,
				asString(message["id"]), id, asString(message["senderId"]), asString(message["body"]), asString(message["timestamp"]), boolInt(message["read"]))
			if err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *Store) messages(conversationID string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, sender_id, body, timestamp, read FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []map[string]any{}
	for rows.Next() {
		var id, senderID, body, timestamp string
		var read int
		if err := rows.Scan(&id, &senderID, &body, &timestamp, &read); err != nil {
			return nil, err
		}
		messages = append(messages, map[string]any{"id": id, "senderId": senderID, "body": body, "timestamp": timestamp, "read": read == 1})
	}
	return messages, rows.Err()
}

func decodeObject(value string) map[string]any {
	var out map[string]any
	if err := json.Unmarshal([]byte(value), &out); err != nil || out == nil {
		return map[string]any{}
	}
	return out
}

func decodeArray(value string) []any {
	var out []any
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []any{}
	}
	return out
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func boolInt(value any) int {
	if value == true {
		return 1
	}
	return 0
}

func anySlice(value any) []any {
	if items, ok := value.([]any); ok {
		return items
	}
	return nil
}

func nullableString(value any) sql.NullString {
	text := asString(value)
	return sql.NullString{String: text, Valid: text != "" && text != "<nil>"}
}

func slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "@", "")
	return strings.ReplaceAll(value, " ", "_")
}
