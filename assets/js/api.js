(function () {
  const jsonHeaders = { "Content-Type": "application/json" };
  const debugPrefix = "[YPG API]";

  function debug(...args) {
    console.debug(debugPrefix, ...args);
  }

  function isBlockedError(error) {
    const message = error?.message || "";
    return /ERR_BLOCKED_BY_CLIENT|blocked|adblock|abp|client.*block/i.test(message);
  }

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
    let response;
    try {
      debug("request", requestInit.method || "GET", path, {
        credentials: requestInit.credentials,
        hasBody: Boolean(requestInit.body),
        bodyType: requestInit.body ? Object.prototype.toString.call(requestInit.body) : "none"
      });
      response = await fetch(path, requestInit);
    } catch (error) {
      const blocked = isBlockedError(error);
      const online = typeof navigator !== "undefined" ? navigator.onLine : "unknown";
      const hint = blocked ? " Possible client-side blocker detected." : "";
      const failure = new Error(`YPG API network error: ${path} (${error.name}: ${error.message})${hint} online=${online}`);
      failure.originalError = error;
      failure.blockedByClient = blocked;
      console.warn(debugPrefix, "network failure", {
        path,
        method: requestInit.method || "GET",
        online,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        blockedByClient: blocked,
        error: error?.message || String(error)
      });
      throw failure;
    }

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
      const statusMessage = `YPG API ${response.status}: ${path}${details}`;
      console.warn(debugPrefix, "response failure", { path, status: response.status, details });
      throw new Error(statusMessage);
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
