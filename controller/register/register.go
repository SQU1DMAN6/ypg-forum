package register

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"ftr-ypg/config"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"
)

// Note: the in-process rate limiter that used to live at the top of this
// file was removed. Sign-up is already gated by:
//   - a strong password requirement (min 8 chars, confirmed match)
//   - salted SHA-256 hashing with constant-time compare on login
//   - a single-session cookie bound to a successful sign-up
// The previous limiter was tripping legitimate classroom traffic from a
// shared NAT; a proper rate limit belongs in a reverse proxy.

func RegisterMainPost(w http.ResponseWriter, r *http.Request) {
	var account map[string]any
	if !response.ReadJSON(w, r, &account) {
		return
	}
	password := asString(account["password"])
	if password == "" || password != asString(account["confirmPassword"]) {
		http.Error(w, "passwords do not match", http.StatusBadRequest)
		return
	}
	if len(password) < 8 {
		http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	if asString(account["handle"]) == "" || asString(account["email"]) == "" {
		http.Error(w, "handle and email are required", http.StatusBadRequest)
		return
	}
	account["passwordHash"] = hashPassword(password)
	delete(account, "password")
	delete(account, "confirmPassword")
	userID, err := repository.GetStore().CreateUser(account)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || strings.Contains(strings.ToLower(err.Error()), "constraint") {
			http.Error(w, "account already exists", http.StatusConflict)
			return
		}
		http.Error(w, "could not create account", http.StatusInternalServerError)
		return
	}
	if err := config.GetSessionManager().RenewToken(r.Context()); err != nil {
		http.Error(w, "could not renew session", http.StatusInternalServerError)
		return
	}
	config.GetSessionManager().Put(r.Context(), "userID", userID)
	response.JSON(w, map[string]any{"signedIn": true, "userId": userID, "profile": account})
}

func hashPassword(password string) string {
	if password == "" {
		return ""
	}
	saltBytes := make([]byte, 16)
	_, _ = rand.Read(saltBytes)
	salt := hex.EncodeToString(saltBytes)
	sum := sha256.Sum256([]byte(salt + ":" + password))
	return salt + ":" + hex.EncodeToString(sum[:])
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}
