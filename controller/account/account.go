package account

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"ftr-ypg/controller/login"
	"ftr-ypg/controller/response"
	"ftr-ypg/repository"
)

// Note: the in-process rate limiter that used to live at the top of this
// file was removed. The HTTP path here is now gated only by:
//   - request-timeout middleware in app/middleware.go
//   - the session/HttpOnly cookie check
//   - server-side input validation (file size, content type, etc.)
// That's enough for a school forum. If real abuse becomes a problem, a
// proper reverse-proxy rate limit is the right place to solve it.

const maxProfileImageBytes = 5 << 20 // 5 MiB

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

func ProfilePicture(w http.ResponseWriter, r *http.Request) {
	userID := login.CurrentUserID(r)
	if userID == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if err := r.ParseMultipartForm(maxProfileImageBytes); err != nil {
		http.Error(w, "image is too large", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, "avatar file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	// Peek at the first bytes to detect content type more reliably
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	ext := extensionFor(contentType, header.Filename)
	if ext == "" {
		http.Error(w, "unsupported image type", http.StatusBadRequest)
		return
	}
	profile, _, err := repository.GetStore().AccountData(userID)
	if err != nil {
		http.Error(w, "could not load profile", http.StatusInternalServerError)
		return
	}
	dir := filepath.Join("ypg", "userData", "pfp", safeName(userID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		http.Error(w, "could not prepare upload", http.StatusInternalServerError)
		return
	}
	filename := randomName() + ext
	diskPath := filepath.Join(dir, filename)
	out, err := os.OpenFile(diskPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		http.Error(w, "could not save image", http.StatusInternalServerError)
		return
	}
	// write the bytes we already read followed by the remainder of the file
	reader := io.MultiReader(bytes.NewReader(buf[:n]), io.LimitReader(file, maxProfileImageBytes))
	if _, err := io.Copy(out, reader); err != nil {
		_ = out.Close()
		_ = os.Remove(diskPath)
		http.Error(w, "could not save image", http.StatusInternalServerError)
		return
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(diskPath)
		http.Error(w, "could not save image", http.StatusInternalServerError)
		return
	}
	oldImage := asString(profile["avatarImage"])
	publicPath := "/" + filepath.ToSlash(diskPath)
	profile["avatarImage"] = publicPath
	if err := repository.GetStore().SaveProfile(userID, profile); err != nil {
		_ = os.Remove(diskPath)
		log.Printf("profile picture upload failed for user %s: %v", userID, err)
		http.Error(w, "could not update profile", http.StatusInternalServerError)
		return
	}
	if strings.HasPrefix(oldImage, "/ypg/userData/pfp/"+safeName(userID)+"/") {
		oldPath := strings.TrimPrefix(oldImage, "/")
		if oldPath != diskPath {
			if err := os.Remove(oldPath); err != nil {
				log.Printf("failed to remove old profile picture %s for user %s: %v", oldPath, userID, err)
			}
		}
	}
	response.JSON(w, map[string]any{"avatarImage": publicPath, "profile": profile})
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

func extensionFor(contentType, filename string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		if ext == ".jpeg" {
			return ".jpg"
		}
		return ext
	default:
		return ""
	}
}

func randomName() string {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return "avatar"
	}
	return hex.EncodeToString(bytes)
}

func safeName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			builder.WriteRune(r)
		}
	}
	if builder.Len() == 0 {
		return "user"
	}
	return builder.String()
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
