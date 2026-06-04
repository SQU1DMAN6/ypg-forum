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

func RegisterRoutes(r chi.Router) {
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("Server is up"))
	})

	r.Get("/api/session", login.Session)
	r.Post("/api/login", login.LoginMainPost)
	r.Post("/api/logout", login.LoginLogout)
	r.Post("/api/signup", register.RegisterMainPost)
	r.Put("/api/profile", account.Profile)
	r.Post("/api/profile-picture", account.ProfilePicture)
	r.Put("/api/settings", account.Settings)
	r.Get("/api/posts", forum.Posts)
	r.Post("/api/posts", forum.Posts)
	r.Post("/api/comments", forum.Comments)
	r.Post("/api/follows/{user}", forum.Follow)
	r.Post("/api/votes/{post}", forum.Vote)
	r.Put("/api/conversations", forum.Conversations)
	r.Get("/favicon.ico", favicon.Favicon)
}
