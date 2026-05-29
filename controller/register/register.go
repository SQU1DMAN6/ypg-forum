package register

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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
	account["passwordHash"] = hashPassword(asString(account["password"]))
	delete(account, "password")
	if err := repository.GetStore().UpsertUserProfile("you", account); err != nil {
		http.Error(w, "could not create account", http.StatusInternalServerError)
		return
	}
	if err := config.GetSessionManager().RenewToken(r.Context()); err != nil {
		http.Error(w, "could not renew session", http.StatusInternalServerError)
		return
	}
	config.GetSessionManager().Put(r.Context(), "userID", "you")
	response.JSON(w, map[string]any{"signedIn": true, "userId": "you", "profile": account})
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
