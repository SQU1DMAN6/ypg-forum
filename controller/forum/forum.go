package forum

import (
	"net/http"

	"ftr-ypg/controller/login"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"

	"github.com/go-chi/chi/v5"
)

func Posts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		posts, err := repository.GetStore().Posts()
		if err != nil {
			http.Error(w, "could not load posts", http.StatusInternalServerError)
			return
		}
		response.JSON(w, posts)
		return
	}
	var post map[string]any
	if !response.ReadJSON(w, r, &post) {
		return
	}
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	created, err := repository.GetStore().CreatePost(userID, post)
	if err != nil {
		http.Error(w, "could not create post", http.StatusInternalServerError)
		return
	}
	response.JSON(w, created)
}

func Comments(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		PostID  string         `json:"postId"`
		Comment map[string]any `json:"comment"`
	}
	if !response.ReadJSON(w, r, &payload) || payload.PostID == "" {
		return
	}
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	comments, err := repository.GetStore().AddComment(userID, payload.PostID, payload.Comment)
	if err != nil {
		http.Error(w, "could not add comment", http.StatusInternalServerError)
		return
	}
	response.JSON(w, comments)
}

func Follow(w http.ResponseWriter, r *http.Request) {
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	follows, err := repository.GetStore().ToggleFollow(userID, chi.URLParam(r, "user"))
	if err != nil {
		http.Error(w, "could not update follow", http.StatusInternalServerError)
		return
	}
	response.JSON(w, follows)
}

func Vote(w http.ResponseWriter, r *http.Request) {
	var payload map[string]any
	if !response.ReadJSON(w, r, &payload) {
		return
	}
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	votes, err := repository.GetStore().ToggleVote(userID, chi.URLParam(r, "post"), asString(payload["direction"]))
	if err != nil {
		http.Error(w, "could not update vote", http.StatusInternalServerError)
		return
	}
	response.JSON(w, votes)
}

func Conversations(w http.ResponseWriter, r *http.Request) {
	var conversations []map[string]any
	if !response.ReadJSON(w, r, &conversations) {
		return
	}
	if login.CurrentUserID(r) == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if err := repository.GetStore().SaveConversations(conversations); err != nil {
		http.Error(w, "could not save conversations", http.StatusInternalServerError)
		return
	}
	response.JSON(w, conversations)
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
