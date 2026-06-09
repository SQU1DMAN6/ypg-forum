package forum

import (
	"log"
	"net/http"
	"strings"

	"ftr-ypg/controller/login"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"

	"github.com/go-chi/chi/v5"
)

// Note: the per-endpoint rate limiters and X-Forwarded-For parsing that
// used to live in this file were removed. The YPG forum doesn't have a
// per-IP brute-force problem worth solving in-process; the global
// request-timeout middleware in app/middleware.go is the only rate
// "policy" the server enforces.

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
	if strings.TrimSpace(asString(post["title"])) == "" || strings.TrimSpace(asString(post["body"])) == "" {
		http.Error(w, "title and body are required", http.StatusBadRequest)
		return
	}
	// Ensure at least one topic is provided and is an array
	if rawTopics, ok := post["topicIds"]; !ok {
		http.Error(w, "at least one topic is required", http.StatusBadRequest)
		return
	} else {
		switch v := rawTopics.(type) {
		case []any:
			if len(v) == 0 {
				http.Error(w, "at least one topic is required", http.StatusBadRequest)
				return
			}
		default:
			http.Error(w, "invalid topics", http.StatusBadRequest)
			return
		}
	}
	created, err := repository.GetStore().CreatePost(userID, post)
	if err != nil {
		log.Printf("could not create post for user %s: %v", userID, err)
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
	if strings.TrimSpace(asString(payload.Comment["body"])) == "" {
		http.Error(w, "comment body is required", http.StatusBadRequest)
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
