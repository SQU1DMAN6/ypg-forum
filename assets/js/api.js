(function () {
  const jsonHeaders = { "Content-Type": "application/json" };

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: jsonHeaders,
      ...options
    });
    if (!response.ok) throw new Error(`YPG API ${response.status}: ${path}`);
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
    createPost(post) {
      return post("/api/posts", post);
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
    saveSettings(settings) {
      return put("/api/settings", settings);
    },
    saveConversations(conversations) {
      return put("/api/conversations", conversations);
    }
  };
})();
