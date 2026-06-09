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

  // Hard upper bound for any backend call. If the server doesn't respond
  // within this window we treat it as offline and let the JS fall back to
  // SSR-rendered content. This is the single biggest "loading forever" fix.
  const DEFAULT_TIMEOUT_MS = 3000;

  function withTimeout(timeoutMs) {
    if (typeof AbortController === "undefined") return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    return controller;
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
    if (!requestInit.signal) {
      const controller = withTimeout(DEFAULT_TIMEOUT_MS);
      if (controller) requestInit.signal = controller.signal;
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
      const blocked = isBlockedError(error) || error?.name === "AbortError";
      const online = typeof navigator !== "undefined" ? navigator.onLine : "unknown";
      const hint = blocked ? " Possible client-side blocker or timeout." : "";
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

  function del(path) {
    return request(path, { method: "DELETE" });
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
    deletePost(postId) {
      return del(`/api/posts/${encodeURIComponent(postId)}`);
    },
    deleteComment(commentId) {
      return del(`/api/comments/${encodeURIComponent(commentId)}`);
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
