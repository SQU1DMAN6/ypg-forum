package account

import (
	"net/http"

	"ftr-ypg/controller/login"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"
)

func Profile(w http.ResponseWriter, r *http.Request) {
	var profile map[string]any
	if !response.ReadJSON(w, r, &profile) {
		return
	}
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if err := repository.GetStore().SaveProfile(userID, profile); err != nil {
		http.Error(w, "could not save profile", http.StatusInternalServerError)
		return
	}
	response.JSON(w, profile)
}

func Settings(w http.ResponseWriter, r *http.Request) {
	var settings map[string]any
	if !response.ReadJSON(w, r, &settings) {
		return
	}
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if err := repository.GetStore().SaveSettings(userID, settings); err != nil {
		http.Error(w, "could not save settings", http.StatusInternalServerError)
		return
	}
	response.JSON(w, settings)
}
