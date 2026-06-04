package login

import (
	"crypto/sha256"
	"crypto/subtle"
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

func Session(w http.ResponseWriter, r *http.Request) {
	userID := CurrentUserID(r)
	signedIn := userID != ""
	if userID == "" {
		userID = "guest"
	}
	state, err := repository.GetStore().State(userID)
	if err != nil {
		http.Error(w, "could not load state", http.StatusInternalServerError)
		return
	}
	response.JSON(w, map[string]any{"signedIn": signedIn, "userId": userID, "state": state})
}

func LoginMainPost(w http.ResponseWriter, r *http.Request) {
	if !limits.Allow(r) {
		http.Error(w, "too many attempts", http.StatusTooManyRequests)
		return
	}
	var payload struct {
		Email    string `json:"email"`
		Handle   string `json:"handle"`
		Password string `json:"password"`
	}
	if !response.ReadJSON(w, r, &payload) {
		return
	}
	identifier := payload.Handle
	if identifier == "" {
		identifier = payload.Email
	}
	if identifier == "" {
		identifier = "you"
	}
	userID, hash, err := repository.GetStore().Credentials(identifier)
	if err != nil || (hash != "" && !registerVerifyPassword(payload.Password, hash)) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := config.GetSessionManager().RenewToken(r.Context()); err != nil {
		http.Error(w, "could not renew session", http.StatusInternalServerError)
		return
	}
	config.GetSessionManager().Put(r.Context(), "userID", userID)
	response.JSON(w, map[string]any{"signedIn": true, "userId": userID})
}

func LoginLogout(w http.ResponseWriter, r *http.Request) {
	_ = config.GetSessionManager().Destroy(r.Context())
	response.JSON(w, map[string]any{"signedIn": false})
}

func CurrentUserID(r *http.Request) string {
	if config.GetSessionManager() == nil {
		return ""
	}
	return config.GetSessionManager().GetString(r.Context(), "userID")
}

func registerVerifyPassword(password, encoded string) bool {
	return verifyPassword(password, encoded)
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, ":")
	if len(parts) != 2 {
		return encoded == "" && password == ""
	}
	sum := sha256.Sum256([]byte(parts[0] + ":" + password))
	expected := hex.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) == 1
}
