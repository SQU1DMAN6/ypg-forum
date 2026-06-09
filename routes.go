package routes

import (
	"net/http"

	"ftr-ypg/controller/account"
	"ftr-ypg/controller/favicon"
	"ftr-ypg/controller/forum"
	"ftr-ypg/controller/login"
	"ftr-ypg/controller/register"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes wires all routes onto r. The mutating endpoints are
// *also* re-registered on the cooldown group inside app/boot.go via
// RegisterMutatingRoutes, so the throttled sub-router sees the same
// (method, path, handler) tuples. Chi deduplicates by the most recent
// registration, which is what we want.
func RegisterRoutes(r chi.Router) {
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("Server is up"))
	})

	// Read-only endpoints
	r.Get("/api/session", login.Session)
	r.Get("/api/posts", forum.Posts)
	r.Get("/favicon.ico", favicon.Favicon)

	// Mutating endpoints (also re-bound on the cooldown group)
	r.Post("/api/login", login.LoginMainPost)
	r.Post("/api/logout", login.LoginLogout)
	r.Post("/api/signup", register.RegisterMainPost)
	r.Put("/api/profile", account.Profile)
	r.Post("/api/profile-picture", account.ProfilePicture)
	r.Put("/api/settings", account.Settings)
	r.Post("/api/posts", forum.Posts)
	r.Post("/api/comments", forum.Comments)
	r.Delete("/api/comments/{id}", forum.DeleteComment)
	r.Post("/api/follows/{user}", forum.Follow)
	r.Post("/api/votes/{post}", forum.Vote)
	r.Delete("/api/posts/{id}", forum.DeletePost)
	r.Put("/api/conversations", forum.Conversations)
}

// RegisterMutatingRoutes binds the same (method, path, handler) tuples
// the mutating API uses onto a separate chi.Router, which the boot
// code mounts inside the 5-second per-user cooldown middleware. The
// read-only endpoints (GET /api/session, GET /api/posts, etc.) are
// deliberately NOT included here so browsing stays unthrottled.
func RegisterMutatingRoutes(r chi.Router) {
	r.Post("/api/login", login.LoginMainPost)
	r.Post("/api/logout", login.LoginLogout)
	r.Post("/api/signup", register.RegisterMainPost)
	r.Put("/api/profile", account.Profile)
	r.Post("/api/profile-picture", account.ProfilePicture)
	r.Put("/api/settings", account.Settings)
	r.Post("/api/posts", forum.Posts)
	r.Post("/api/comments", forum.Comments)
	r.Delete("/api/comments/{id}", forum.DeleteComment)
	r.Post("/api/follows/{user}", forum.Follow)
	r.Post("/api/votes/{post}", forum.Vote)
	r.Delete("/api/posts/{id}", forum.DeletePost)
	r.Put("/api/conversations", forum.Conversations)
}
