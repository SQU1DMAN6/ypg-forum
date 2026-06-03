package register

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"ftr-ypg/config"
	"ftr-ypg/controller/auth"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"
)

var limits = auth.NewRateLimiter(20, 10*time.Minute)

func RegisterMainPost(w http.ResponseWriter, r *http.Request) {
	if !limits.Allow(r) {
		http.Error(w, "too many attempts", http.StatusTooManyRequests)
		return
	}
	var account map[string]any
	if !response.ReadJSON(w, r, &account) {
		return
	}
	password := asString(account["password"])
	if password == "" || password != asString(account["confirmPassword"]) {
		http.Error(w, "passwords do not match", http.StatusBadRequest)
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
