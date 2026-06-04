(function () {
  const jsonHeaders = { "Content-Type": "application/json" };

  async function request(path, options = {}) {
    const requestInit = {
      credentials: "same-origin",
      ...options
    };
    if (options.headers === null) {
      delete requestInit.headers;
    } else {
      requestInit.headers = { ...jsonHeaders, ...(options.headers || {}) };
    }
    const response = await fetch(path, requestInit);
    if (!response.ok) {
      let details = "";
      try {
        const json = await response.json();
        if (json && json.error) details = ` ${json.error}`;
      } catch (error) {
        try {
          const text = await response.text();
          if (text) details = ` ${text}`;
        } catch (ignore) {}
      }
      throw new Error(`YPG API ${response.status}: ${path}${details}`);
    }
    return response.json();
  }

  function post(path, body = {}) {
    return request(path, { method: "POST", body: JSON.stringify(body) });
  }

  function put(path, body = {}) {
    return request(path, { method: "PUT", body: JSON.stringify(body) });
  }

  window.YPGApi = {
    async session() {
      return request("/api/session");
    },
    login(credentials = {}) {
      return post("/api/login", credentials);
    },
    logout() {
      return post("/api/logout");
    },
    signup(account) {
      return post("/api/signup", account);
    },
    createPost(payload) {
      return post("/api/posts", payload);
    },
    addComment(postId, comment) {
      return post("/api/comments", { postId, comment });
    },
    toggleFollow(userId) {
      return post(`/api/follows/${encodeURIComponent(userId)}`);
    },
    toggleVote(postId, direction) {
      return post(`/api/votes/${encodeURIComponent(postId)}`, { direction });
    },
    saveProfile(profile) {
      return put("/api/profile", profile);
    },
    uploadProfilePicture(file) {
      const form = new FormData();
      form.append("avatar", file);
      return request("/api/profile-picture", { method: "POST", headers: null, body: form });
    },
    saveSettings(settings) {
      return put("/api/settings", settings);
    },
    saveConversations(conversations) {
      return put("/api/conversations", conversations);
    }
  };
})();
