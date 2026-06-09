package login

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strings"

	"ftr-ypg/config"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"
)

// Note: the in-process rate limiter that used to live at the top of this
// file was removed. Sign-in remains gated by:
//   - the salted SHA-256 password hash with constant-time compare
//   - the HttpOnly+SameSite=Strict session cookie
//   - the request-timeout middleware in app/middleware.go
// The previous 20/10min limiter was tripping a classroom of 30 students
// behind a single NAT after a few minutes of normal use. A real per-IP
// brute-force limit belongs in a reverse proxy (caddy / nginx / cloud).

// Session returns the current viewer and a flag indicating whether they
// are signed in. This is the hot endpoint called by every page load;
// it MUST stay fast. It deliberately does not assemble the full backend
// "state" payload -- that used to mean eight sqlite queries per page
// view, which is what made the JS layer hang on "Loading YPG Forum..."
// when the session or message table was locked.
func Session(w http.ResponseWriter, r *http.Request) {
	userID := CurrentUserID(r)
	signedIn := userID != ""
	if userID == "" {
		userID = "guest"
	}
	response.JSON(w, map[string]any{"signedIn": signedIn, "userId": userID})
}

func LoginMainPost(w http.ResponseWriter, r *http.Request) {
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
