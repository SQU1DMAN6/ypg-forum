(function () {
  const data = window.YPG_DATA;
  const store = window.YPGStore;
  const render = window.YPGRender;
  let currentPage = null;
  let currentTopicId = null;
  const runtimePrefix = "[YPG Runtime]";

  function debug(...args) {
    console.debug(runtimePrefix, ...args);
  }

  // The server already renders the full page (sidebar, topbar, post list, etc.)
  // via html/template. The JS layer is purely progressive enhancement, so we
  // MUST NOT wipe the SSR'd content. Doing so used to leave the user staring
  // at "Loading YPG Forum…" forever whenever /api/session was slow.
  //
  // The shell()/renderXxx() helpers below are now opt-in: we only call them
  // when the SSR shell is missing (e.g. a static HTML file served from
  // somewhere else, or a future SPA fallback). The common path is to enhance
  // the already-rendered DOM in place.
  function hasServerRenderedShell() {
    if (typeof document === "undefined") return false;
    const app = document.getElementById("app");
    if (!app) return false;
    // The SSR template renders a sidebar + main + right aside inside .app,
    // plus a populated #page-content. If any of those are present, treat
    // it as "the server did its job, don't replace it".
    return Boolean(
      app.querySelector(".app .left") ||
        app.querySelector(".app .main") ||
        app.querySelector(".app .right") ||
        (document.getElementById("page-content") &&
          document.getElementById("page-content").children.length > 0)
    );
  }

  function attachGlobalDebugHandlers() {
    if (window.__YPG_RUNTIME_DEBUG_ATTACHED__) return;
    window.__YPG_RUNTIME_DEBUG_ATTACHED__ = true;

    // Capture <script> tag load errors. When an extension like an ad blocker
    // blocks a third-party script, the browser fires an "error" event on the
    // <script> element with a synthetic "Script error." message. The element
    // carries the original src so we can log it and surface it on the
    // visible debug panel.
    window.addEventListener("error", (event) => {
      const target = event.target;
      if (target && target !== window && (target.src || target.href)) {
        const entry = {
          kind: "resource",
          tag: target.tagName,
          url: target.src || target.href,
          page: window.location.pathname
        };
        console.warn(runtimePrefix, "resource failed to load", entry);
        showDebugPanel();
        appendDebug("resource-error", entry);
        return;
      }
      const entry = {
        kind: "error",
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      };
      console.error(runtimePrefix, "uncaught error:", event.error || event.message, entry);
      showDebugPanel();
      appendDebug("uncaught", entry);
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
      const entry = { kind: "rejection", reason: String(event.reason?.message || event.reason || "unknown") };
      console.error(runtimePrefix, "unhandled promise rejection:", event.reason);
      showDebugPanel();
      appendDebug("rejection", entry);
    });
  }

  function debugPanelEnabled() {
    // Show the panel if the body has data-debug="1" (set by SSR when the
    // visitor appends ?debug=1 to any URL) or when the URL carries the
    // flag directly. We default to hidden to keep the regular user
    // experience clean.
    if (typeof document === "undefined") return false;
    const body = document.body;
    if (body && body.dataset && body.dataset.debug === "1") return true;
    try {
      const search = new URLSearchParams(window.location.search || "");
      return search.get("debug") === "1";
    } catch (error) {
      return false;
    }
  }

  function showDebugPanel() {
    if (!debugPanelEnabled()) return;
    const panel = document.getElementById("ypg-debug-panel");
    if (panel) panel.hidden = false;
    const pre = document.getElementById("ypg-runtime-debug");
    if (pre && pre.textContent.trim() === "") {
      pre.textContent = "[YPG runtime attached at " + new Date().toISOString() + "]";
    }
  }

  function appendDebug(kind, entry) {
    if (!debugPanelEnabled()) return;
    const pre = document.getElementById("ypg-runtime-debug");
    if (!pre) return;
    const stamp = new Date().toISOString();
    const line = "[" + stamp + "] " + kind + " " + JSON.stringify(entry, null, 2) + "\n";
    pre.textContent = (pre.textContent || "") + line;
  }

  function showBlockedHint() {
    try {
      if (localStorage.getItem("ypg-forum:block-hint-hidden")) return;
      const banner = document.createElement("div");
      banner.className = "ypg-block-hint";
      banner.innerHTML = `<div style="max-width:980px;margin:0 auto;">Third-party scripts or analytics appear to be blocked by a browser extension. This can interfere with features and diagnostics. <button id="ypg-hide-block-hint" style="margin-left:12px;padding:6px 10px">Dismiss</button></div>`;
      banner.style.position = "fixed";
      banner.style.top = "0";
      banner.style.left = "0";
      banner.style.right = "0";
      banner.style.background = "#fff3cd";
      banner.style.color = "#856404";
      banner.style.padding = "10px";
      banner.style.zIndex = "9999";
      banner.style.borderBottom = "1px solid #ffeeba";
      banner.style.textAlign = "center";
      document.body.insertBefore(banner, document.body.firstChild);
      document.getElementById("ypg-hide-block-hint").addEventListener("click", () => {
        try { banner.remove(); localStorage.setItem("ypg-forum:block-hint-hidden", "1"); } catch (e) {}
      });
    } catch (e) {}
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function getPosts() {
    return store.allPosts();
  }

  function postMatchesSearch(post, searchValue) {
    if (!searchValue) return true;
    const author = render.userById(post.authorId);
    const topics = post.topicIds.map((id) => render.topicById(id)?.label || "").join(" ");
    const haystack = `${post.title} ${post.body} ${author.name} ${author.handle} ${topics}`.toLowerCase();
    return haystack.includes(searchValue.toLowerCase());
  }

  function renderPostList(posts, emptyTitle, emptyText) {
    const content = document.getElementById("post-list");
    content.innerHTML = posts.length ? posts.map(render.postCard).join("") : render.emptyState(emptyTitle, emptyText);
    bindInteractive();
  }

  function renderFeedPage({ mode, topicId = null }) {
    currentPage = mode;
    currentTopicId = topicId;
    const topic = topicId ? render.topicById(topicId) : null;
    const title = mode === "following" ? "Following Feed" : topic ? topic.label : "Discussion Feed";
    const description = mode === "following"
      ? "Posts from the people you follow. Follow or unfollow members anywhere and this feed updates."
      : topic
        ? topic.description
        : "Browse recent YPG questions, arguments, and ideas from MHS students.";

    render.shell({
      activePage: mode,
      activeTopicId: topicId,
      title,
      description,
      searchPlaceholder: topic ? `Search ${topic.label.toLowerCase()}...` : "Search discussions, authors, arguments..."
    });

    const content = document.getElementById("page-content");
    if (mode === "home") {
      content.innerHTML = `
        <section class="filter-panel">
          <div><h3>Filter by topics</h3></div>
          <div class="chip-row" data-topic-filters>
            ${data.topics.map((item) => `<button class="chip" type="button" data-filter-topic="${item.id}" style="--tag-color:${item.color}">${item.label}</button>`).join("")}
          </div>
        </section>
        <section class="feed" id="post-list" aria-label="Forum posts"></section>`;
    } else {
      content.innerHTML = `<section class="feed" id="post-list" aria-label="Forum posts"></section>`;
    }
    bindFeedFilters(mode, topicId);
  }

  function bindFeedFilters(mode, topicId) {
    const selectedTopics = new Set();
    const searchInput = document.querySelector("[data-search-input]");
    const filterButtons = document.querySelectorAll("[data-filter-topic]");

    function apply() {
      const followedIds = store.follows();
      const searchValue = searchInput ? searchInput.value.trim() : "";
      const posts = getPosts().filter((post) => {
        if (mode === "following" && !followedIds.includes(post.authorId)) return false;
        if (topicId && !post.topicIds.includes(topicId)) return false;
        if (selectedTopics.size && !post.topicIds.some((id) => selectedTopics.has(id))) return false;
        return postMatchesSearch(post, searchValue);
      });
      renderPostList(posts, "No posts found", mode === "following" ? "Follow a few members to fill this feed." : "Try changing your topic filters or search.");
    }

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const topic = button.dataset.filterTopic;
        if (selectedTopics.has(topic)) {
          selectedTopics.delete(topic);
          button.classList.remove("active");
        } else {
          selectedTopics.add(topic);
          button.classList.add("active");
        }
        apply();
      });
    });

    if (searchInput) searchInput.addEventListener("input", apply);
    const clear = document.querySelector("[data-clear-search]");
    if (clear) clear.addEventListener("click", () => {
      searchInput.value = "";
      apply();
      searchInput.focus();
    });
    apply();
  }

  function renderCreatePost() {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    currentPage = "create";
    render.shell({
      activePage: "create",
      title: "Create Post",
      description: "Write a discussion starter and choose up to three philosophy topics.",
      actionLabel: "Back to Feed",
      actionHref: "index.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="content-panel">
        <form class="form-grid" id="create-post-form">
          <div class="field"><label for="title">Title</label><input id="title" name="title" type="text" maxlength="120" placeholder="Example: Is free will compatible with determinism?"></div>
          <div class="field"><label for="body">Post text</label><textarea id="body" name="body" maxlength="1000" placeholder="Write your claim, evidence, and question for discussion."></textarea></div>
          <div class="field">
            <label>Topics <span class="soft-note">Choose 1 to 3</span></label>
            <div class="chip-row selectable-topics">
              ${data.topics.map((topic) => `<label class="chip checkbox-chip" style="--tag-color:${topic.color}"><input type="checkbox" name="topics" value="${topic.id}">${topic.label}</label>`).join("")}
            </div>
          </div>
          <p class="form-error" id="form-error" aria-live="polite"></p>
          <div class="form-actions"><button class="button primary" type="submit">Post Discussion</button><a class="button" href="index.html">Cancel</a></div>
        </form>
      </section>`;
    bindCreateForm();
    bindInteractive();
  }

  function bindCreateForm() {
    const form = document.getElementById("create-post-form");
    const error = document.getElementById("form-error");
    const topicInputs = [...form.querySelectorAll("input[name='topics']")];
    topicInputs.forEach((input) => {
      input.addEventListener("change", () => {
        const checked = topicInputs.filter((item) => item.checked);
        if (checked.length > 3) {
          input.checked = false;
          error.textContent = "Pick up to 3 topics only.";
        } else {
          error.textContent = "";
        }
      });
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      const title = form.title.value.trim();
      const body = form.body.value.trim();
      const topicIds = topicInputs.filter((item) => item.checked).map((item) => item.value);
      if (!title || !body || topicIds.length === 0) {
        error.textContent = "Add a title, post text, and at least one topic.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Posting...";
      const postData = {
        title,
        body,
        authorId: data.currentUserId,
        topicIds,
        score: 0,
        comments: 0,
        createdAt: "Just now"
      };
      try {
        const saved = await store.addPost(postData);
        window.location.href = `post.html?id=${encodeURIComponent(saved.id)}`;
      } catch (saveError) {
        submit.disabled = false;
        submit.textContent = "Post Discussion";
        console.error("Post save failed", saveError);
        if (saveError?.message?.includes("401")) {
          error.textContent = "You need to sign in again before posting. Please refresh and sign in.";
        } else {
          error.textContent = `Could not save that discussion. ${saveError.message || "Please try again in a moment."}`;
        }
      }
    });
  }

  function relatedPostsFor(post) {
    return getPosts()
      .filter((candidate) => candidate.id !== post.id && candidate.topicIds.some((topicId) => post.topicIds.includes(topicId)))
      .slice(0, 4);
  }

  function renderPostPage() {
    const postId = params().get("id");
    const post = store.postById(postId);
    currentPage = "post";

    if (!post) {
      render.shell({
        activePage: "post",
        title: "Post not found",
        description: "This discussion could not be found. It may have been removed or only existed in another browser."
      });
      document.getElementById("page-content").innerHTML = render.emptyState("Post not found", "Return to the feed and choose another discussion.");
      return;
    }

    const comments = store.commentsForPost(post.id);
    const relatedPosts = relatedPostsFor(post);
    render.shell({
      activePage: "post",
      activeTopicId: post.topicIds[0],
      title: "Discussion",
      description: "Read the full post, vote, and add to the conversation."
    });
    document.getElementById("page-content").innerHTML = `
      ${render.postDetail(post)}
      <section class="comments-panel">
        <div class="section-heading inline-heading"><h3>Comments</h3><span>${store.commentCountFor(post)} total</span></div>
        <div class="comment-list">
          ${comments.length ? render.threadedComments(comments) : render.emptyState("No comments yet", "Start the discussion with a thoughtful reply.")}
        </div>
        <form class="comment-form" id="comment-form">
          <label for="comment-body">Add a comment</label>
          <textarea id="comment-body" name="body" ${store.isSignedIn() ? "" : "disabled"} placeholder="${store.isSignedIn() ? "Write a reply that adds a reason, example, or question." : "Sign in to add a comment."}"></textarea>
          <div class="form-actions">
            <button class="button primary" type="submit">${store.isSignedIn() ? "Post Comment" : "Sign in to comment"}</button>
            <a class="button" href="index.html">Back to Feed</a>
          </div>
          <p class="form-error" id="comment-error" aria-live="polite"></p>
        </form>
      </section>
      <section class="related-panel">
        <div class="section-heading inline-heading"><h3>Related posts</h3><span>Shared topics</span></div>
        <div class="related-grid">${relatedPosts.length ? relatedPosts.map(render.relatedPostCard).join("") : render.emptyState("No related posts yet", "Related discussions will appear when topics overlap.")}</div>
      </section>`;
    bindCommentForm(post.id);
    bindReplyForms(post.id);
    bindInteractive();
  }

  async function submitComment(postId, form, parentId = null) {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    const body = form.body.value.trim();
    if (!body) {
      const error = form.querySelector("[data-comment-error]") || document.getElementById("comment-error");
      if (error) error.textContent = "Write a comment before posting.";
      return;
    }
    const submit = form.querySelector("button[type='submit']");
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = "Posting...";
    try {
      await store.addComment(postId, {
      authorId: data.currentUserId,
      parentId,
      body,
      createdAt: "Just now"
      });
      renderPostPage();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = parentId ? "Post Reply" : "Post Comment";
      const errorNode = form.querySelector("[data-comment-error]") || document.getElementById("comment-error");
      if (errorNode) error.textContent = "Could not save that comment. Please try again.";
    }
  }
  function bindCommentForm(postId) {
    const form = document.getElementById("comment-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitComment(postId, form);
    });
  }

  function bindReplyForms(postId) {
    document.querySelectorAll("[data-reply-to]").forEach((button) => {
      button.addEventListener("click", () => {
        const parentId = button.dataset.replyTo;
        const slot = document.querySelector(`[data-reply-slot="${parentId}"]`);
        if (!slot) return;
        slot.innerHTML = `
          <form class="comment-form compact-reply" data-reply-form="${parentId}">
            <textarea name="body" placeholder="Reply to this comment"></textarea>
            <div class="form-actions"><button class="button primary" type="submit">Post Reply</button><button class="button" type="button" data-cancel-reply>Cancel</button></div>
            <p class="form-error" data-comment-error aria-live="polite"></p>
          </form>`;
        const form = slot.querySelector("form");
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          submitComment(postId, form, parentId);
        });
        slot.querySelector("[data-cancel-reply]").addEventListener("click", () => {
          slot.innerHTML = "";
        });
      });
    });
  }

  function renderProfile() {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    currentPage = "profile";
    const me = render.userById(data.currentUserId);
    render.shell({
      activePage: "profile",
      title: "Your Profile",
      description: "",
      actionLabel: "+ Create Post",
      actionHref: "create-post.html"
    });
    const myPosts = getPosts().filter((post) => post.authorId === data.currentUserId);
    const followers = store.followersFor(data.currentUserId);
    const following = store.followingUsers();
    document.getElementById("page-content").innerHTML = `
      <section class="profile-hero">
        ${render.avatar(me, "large")}
        <div><h3>${render.escapeHtml(me.name)}</h3><p>@${render.escapeHtml(me.handle)} &middot; ${render.escapeHtml(me.year)}</p><p>${render.escapeHtml(me.bio)}</p><div class="tag-row">${render.topicTags(me.interests || [])}</div></div>
        <div class="profile-actions"><a class="follow" href="settings.html">Edit Profile</a><a class="follow muted-follow" href="account.html">Account</a></div>
      </section>
      <section class="stats-row">
        <div><strong>${myPosts.length}</strong><span>Posts</span></div>
        <div><strong>${followers.length}</strong><span>Followers</span></div>
        <div><strong>${following.length}</strong><span>Following</span></div>
      </section>
      <section class="follow-grid">
        <article class="settings-panel"><h3>Followers</h3>${followers.length ? followers.map((user) => `<a class="followed-user" href="user.html?id=${encodeURIComponent(user.id)}">${render.avatar(user, "small")}<span>${render.escapeHtml(user.name)}</span></a>`).join("") : `<p class="quiet">No followers yet.</p>`}</article>
        <article class="settings-panel"><h3>Following</h3>${following.length ? following.map((user) => `<a class="followed-user" href="user.html?id=${encodeURIComponent(user.id)}">${render.avatar(user, "small")}<span>${render.escapeHtml(user.name)}</span></a>`).join("") : `<p class="quiet">You are not following anyone yet.</p>`}</article>
      </section>
      <section class="section-heading"><h3>Your posts</h3></section>
      <section class="feed">${myPosts.length ? myPosts.map(render.postCard).join("") : render.emptyState("No posts yet", "Create your first discussion from the Create Post page.")}</section>`;
    bindInteractive();
  }

  function renderSettings() {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    currentPage = "settings";
    const me = render.userById(data.currentUserId);
    const settings = store.settings();
    render.shell({
      activePage: "settings",
      title: "Settings",
      description: "",
      actionLabel: "View Profile",
      actionHref: "profile.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="profile-hero" id="settings-preview">
        ${render.avatar(me, "large")}
        <div><h3>${render.escapeHtml(me.name)}</h3><p>@${render.escapeHtml(me.handle)} &middot; ${render.escapeHtml(me.year)}</p><p>${render.escapeHtml(me.bio)}</p></div>
      </section>
      <section class="content-panel">
        <form class="form-grid" id="profile-form">
          <div class="field"><label for="profile-name">Display name</label><input id="profile-name" name="name" type="text" value="${render.escapeHtml(me.name)}"></div>
          <div class="field"><label for="profile-handle">Handle</label><input id="profile-handle" name="handle" type="text" value="${render.escapeHtml(me.handle)}"></div>
          <div class="field"><label for="profile-year">Year/group</label><input id="profile-year" name="year" type="text" value="${render.escapeHtml(me.year)}"></div>
          <div class="field"><label for="profile-initials">Avatar initials</label><input id="profile-initials" name="initials" type="text" maxlength="3" value="${render.escapeHtml(me.initials)}"></div>
          <div class="field"><label for="profile-color">Avatar color</label><div class="color-picker-row"><input id="profile-color" name="avatarColor" type="color" value="${render.escapeHtml(me.avatarColor)}"><div class="color-presets">${data.avatarPresets.map((color) => `<button type="button" class="color-preset" data-color="${color}" style="--preset-color:${color}" aria-label="Use ${color}"></button>`).join("")}</div></div></div>
          <div class="field"><label for="profile-image">Profile picture</label><input id="profile-image" name="avatarFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></div>
          <div class="field"><label for="profile-bio">Bio</label><textarea id="profile-bio" name="bio">${render.escapeHtml(me.bio)}</textarea></div>
          <div class="form-actions"><button class="button primary" type="submit">Save Settings</button><a class="button" href="following.html">Open Following Feed</a></div>
          <p class="success-note" id="profile-saved" aria-live="polite"></p>
        </form>
      </section>`;
    hydrateSettings(settings);
    document.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById("profile-color").value = button.dataset.color;
      });
    });
    document.getElementById("profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.target.querySelector("button[type='submit']");
      if (submit.disabled) return;
      submit.disabled = true;
      const fields = event.target.elements;
      await store.saveProfile({
        name: fields.name.value.trim() || me.name,
        handle: fields.handle.value.trim() || me.handle,
        year: fields.year.value.trim() || me.year,
        initials: fields.initials.value.trim().toUpperCase() || me.initials,
        avatarColor: fields.avatarColor.value || me.avatarColor,
        bio: fields.bio.value.trim() || me.bio
      });
      const image = fields.avatarFile.files[0];
      if (image) {
        try {
          await store.uploadProfilePicture(image);
        } catch (error) {
          console.error("Profile picture upload failed", error);
          document.getElementById("profile-saved").textContent = `Profile saved, but picture upload failed: ${error.message}`;
          submit.disabled = false;
          return;
        }
      }
      submit.disabled = false;
      document.getElementById("profile-saved").textContent = "Saved. Your profile is synced with the YPG backend.";
      const updated = render.userById(data.currentUserId);
      document.getElementById("settings-preview").innerHTML = `${render.avatar(updated, "large")}<div><h3>${render.escapeHtml(updated.name)}</h3><p>@${render.escapeHtml(updated.handle)} &middot; ${render.escapeHtml(updated.year)}</p><p>${render.escapeHtml(updated.bio)}</p></div>`;
      const topbarProfile = document.querySelector(".profile");
      if (topbarProfile) topbarProfile.innerHTML = render.avatar(updated, "profile-avatar");
    });
    bindInteractive();
  }

  function hydrateSettings(settings) {
    const ids = {
      "message-permission": "messagePermission",
      "profile-visibility": "profileVisibility",
      appearance: "appearance"
    };
    Object.entries(ids).forEach(([id, key]) => {
      const element = document.getElementById(id);
      if (element) element.value = settings[key];
      if (element) element.addEventListener("change", () => store.saveSettings({ [key]: element.value }));
    });
    const checks = {
      "message-requests": "messageRequests",
      "read-receipts": "readReceipts",
      "quiet-hours": "quietHours",
      "reply-notifications": "replyNotifications",
      "follow-notifications": "followNotifications",
      "email-notifications": "emailNotifications",
      "show-online-status": "showOnlineStatus"
    };
    Object.entries(checks).forEach(([id, key]) => {
      const element = document.getElementById(id);
      if (element) element.checked = Boolean(settings[key]);
      if (element) element.addEventListener("change", () => store.saveSettings({ [key]: element.checked }));
    });
    const logout = document.getElementById("logout-account");
    if (logout) logout.addEventListener("click", () => {
      store.logoutDemo();
      window.location.href = "signin.html";
    });
    const reset = document.getElementById("reset-data");
    if (reset) reset.addEventListener("click", () => {
      store.resetBrowserCache();
      window.location.href = "index.html";
    });
    const exportData = document.getElementById("export-data");
    if (exportData) exportData.addEventListener("click", () => {
      document.getElementById("data-preview").textContent = JSON.stringify(store.exportLocalData(), null, 2);
    });
  }

  function renderAccount() {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    currentPage = "account";
    const me = render.userById(data.currentUserId);
    const followers = store.followersFor(data.currentUserId);
    const following = store.followingUsers();
    render.shell({
      activePage: "account",
      title: "Account",
      description: "",
      actionLabel: "View Profile",
      actionHref: "profile.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="profile-hero">
        ${render.avatar(me, "large")}
        <div><h3>${render.escapeHtml(me.name)}</h3><p>@${render.escapeHtml(me.handle)}</p><p class="quiet">Account controls, followers, following, and browser cache management.</p></div>
        <div class="profile-actions"><a class="follow" href="settings.html">Settings</a><a class="follow muted-follow" href="profile.html">Profile</a></div>
      </section>`;
    hydrateSettings(store.settings());
  }

  function renderUserProfile() {
    const userId = params().get("id") || "futsali";
    const user = render.userById(userId);
    currentPage = "user";
    render.shell({
      activePage: "user",
      title: user.name,
      description: `@${user.handle} - ${user.year}`,
      actionLabel: "+ Create Post",
      actionHref: "create-post.html"
    });
    const userPosts = getPosts().filter((post) => post.authorId === user.id);
    document.getElementById("page-content").innerHTML = `
      <section class="profile-hero">
        ${render.avatar(user, "large")}
        <div><h3>${render.escapeHtml(user.name)}</h3><p>@${render.escapeHtml(user.handle)} &middot; ${render.escapeHtml(user.year)}</p><p>${render.escapeHtml(user.bio)}</p><div class="tag-row">${render.topicTags(user.interests || [])}</div></div>
        <div class="profile-actions">${render.followButton(user.id)}${render.messageButton(user.id)}</div>
      </section>
      <section class="stats-row">
        <div><strong>${userPosts.length}</strong><span>Posts</span></div>
        <div><strong>${store.followersFor(user.id).length}</strong><span>Followers</span></div>
        <div><strong>${store.isFollowing(user.id) ? "Yes" : "No"}</strong><span>Following</span></div>
      </section>
      <section class="section-heading"><h3>${render.escapeHtml(user.name)}'s posts</h3></section>
      <section class="feed">${userPosts.length ? userPosts.map(render.postCard).join("") : render.emptyState("No posts yet", "This member has not posted yet.")}</section>`;
    bindInteractive();
  }

  function renderMessages() {
    if (!store.isSignedIn()) {
      window.location.href = "signin.html";
      return;
    }
    currentPage = "messages";
    const chatUserId = params().get("chat");
    const selected = chatUserId ? store.conversationWith(chatUserId) : store.conversations()[0];
    const otherId = selected?.participantIds.find((id) => id !== data.currentUserId);
    const other = render.userById(otherId || "futsali");
    render.shell({
      activePage: "messages",
      title: "Messages",
      description: "Direct messages sync through the YPG backend."
    });
    document.getElementById("page-content").innerHTML = `<section class="content-panel"><p>Messages are still in early access. Use the right sidebar to start a conversation.</p></section>`;
    bindInteractive();
  }

  function renderSignin() {
    currentPage = "signin";
    render.shell({
      activePage: "signin",
      title: "Sign In",
      description: "Sign in with the YPG backend session.",
      actionLabel: "Back to Feed",
      actionHref: "index.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="auth-card">
        <form class="form-grid" id="signin-form">
        <h3>Welcome back</h3>
        <p>Sign in to post, follow, vote, and open direct messages.</p>
        <div class="field"><label>Email or handle</label><input name="identifier" type="text" placeholder="you@mhs or @you" required></div>
        <div class="field"><label>Password</label><input name="password" type="password" placeholder="Your password"></div>
        <p class="form-error" id="signin-error" aria-live="polite"></p>
        <div class="form-actions"><button class="button primary" type="submit" id="signin-submit">Sign in</button><a class="button" href="signup.html">Create account</a></div>
        </form>
      </section>`;
    document.getElementById("signin-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.target.querySelector("button[type='submit']");
      if (submit.disabled) return;
      submit.disabled = true;
      submit.textContent = "Signing in...";
      const fields = event.target.elements;
      try {
        await store.loginDemo({ handle: fields.identifier.value.trim().replace(/^@/, ""), email: fields.identifier.value.trim(), password: fields.password.value });
        window.location.href = "index.html";
      } catch (error) {
        submit.disabled = false;
        submit.textContent = "Sign in";
        document.getElementById("signin-error").textContent = "Could not sign in with those credentials.";
      }
    });
  }

  function renderSignup() {
    currentPage = "signup";
    render.shell({
      activePage: "signup",
      title: "Sign Up",
      description: "Create a YPG account for the FtR-run backend.",
      actionLabel: "Back to Feed",
      actionHref: "index.html"
    });
    document.getElementById("page-content").innerHTML = `<section class="auth-card"><p>Sign-up is handled by the YPG backend. Please contact the FtR team for an invite.</p></section>`;
  }

  function refreshCurrentPage() {
    if (currentPage === "home") renderFeedPage({ mode: "home" });
    else if (currentPage === "following") renderFeedPage({ mode: "following" });
    else if (currentPage === "topic") renderFeedPage({ mode: "topic", topicId: currentTopicId });
    else if (currentPage === "user") renderUserProfile();
    else if (currentPage === "profile") renderProfile();
    else if (currentPage === "settings") renderSettings();
    else if (currentPage === "account") renderAccount();
    else if (currentPage === "messages") renderMessages();
    else if (currentPage === "signin") renderSignin();
    else if (currentPage === "signup") renderSignup();
    else if (currentPage === "post") renderPostPage();
  }

  function bindInteractive() {
    document.querySelectorAll("[data-follow-user]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!store.isSignedIn()) {
          window.location.href = "signin.html";
          return;
        }
        store.toggleFollow(button.dataset.followUser);
        // Update the button label inline to keep the user on the same
        // page; a full refresh is wasteful for a single toggle.
        const isFollowing = store.isFollowing(button.dataset.followUser);
        button.textContent = isFollowing ? "Following" : "Follow";
        button.classList.toggle("following", isFollowing);
      });
    });
    document.querySelectorAll("[data-vote]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!store.isSignedIn()) {
          window.location.href = "signin.html";
          return;
        }
        const postId = button.dataset.postId;
        const direction = button.dataset.vote;
        store.toggleVote(postId, direction);
        // Re-render the score inline so the user sees the new value
        // without a full page reload.
        const post = store.postById(postId);
        if (post) {
          const score = store.scoreFor(post);
          const scoreEl = document.querySelector(`[data-score-for="${CSS.escape(postId)}"]`);
          if (scoreEl) scoreEl.textContent = String(score);
          // Highlight whichever arrow the user just picked.
          const card = button.closest("article.post, article.post-detail");
          if (card) {
            card.querySelectorAll(".vote-btn").forEach((b) => {
              b.classList.remove("active", "down");
            });
            if (store.voteFor(postId) === direction) {
              button.classList.add("active");
              if (direction === "down") button.classList.add("down");
            }
          }
        }
      });
    });
    document.querySelectorAll("article.post[data-post-link]").forEach((article) => {
      if (article.dataset.bound === "1") return;
      article.dataset.bound = "1";
      article.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, textarea, select")) return;
        const href = article.dataset.postLink;
        if (href) window.location.href = href;
      });
      article.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button, a, input, textarea, select")) return;
        event.preventDefault();
        const href = article.dataset.postLink;
        if (href) window.location.href = href;
      });
    });
    // Per-row Delete affordances. The button is only rendered server-side
    // when the current user owns the row, so we just confirm + call the
    // API + reload. We could optimistically remove the element from the
    // DOM but a full reload is simpler and avoids drift with the SSR
    // cache.
    document.querySelectorAll("[data-delete-post]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm("Delete this post? This cannot be undone.")) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = "Deleting...";
        try {
          await window.YPGApi.deletePost(button.dataset.deletePost);
          // If we're on the post page, send the user back to the feed.
          if (window.location.pathname.endsWith("post.html")) {
            window.location.href = "/";
          } else {
            window.location.reload();
          }
        } catch (err) {
          button.disabled = false;
          button.textContent = original;
          alert(`Could not delete post: ${err.message || err}`);
        }
      });
    });
    document.querySelectorAll("[data-delete-comment]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm("Delete this comment?")) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = "Deleting...";
        try {
          await window.YPGApi.deleteComment(button.dataset.deleteComment);
          window.location.reload();
        } catch (err) {
          button.disabled = false;
          button.textContent = original;
          alert(`Could not delete comment: ${err.message || err}`);
        }
      });
    });
    // Topic-filter chips. The SSR template emits them as buttons with
    // data-filter-topic, and clicking a chip should add/remove the topic
    // from the active filter and re-render the visible feed. We do this
    // client-side so it doesn't round-trip the server for every click.
    const filterContainer = document.querySelector("[data-topic-filters]");
    if (filterContainer && !filterContainer.dataset.bound) {
      filterContainer.dataset.bound = "1";
      const active = new Set();
      const searchInput = document.querySelector("[data-search-input]");
      filterContainer.addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter-topic]");
        if (!button) return;
        const topic = button.dataset.filterTopic;
        if (active.has(topic)) {
          active.delete(topic);
          button.classList.remove("active");
        } else {
          active.add(topic);
          button.classList.add("active");
        }
        applyClientFilters(active, searchInput);
      });
      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "1";
        searchInput.addEventListener("input", () => applyClientFilters(active, searchInput));
      }
      const clear = document.querySelector("[data-clear-search]");
      if (clear && !clear.dataset.bound) {
        clear.dataset.bound = "1";
        clear.addEventListener("click", () => {
          searchInput.value = "";
          applyClientFilters(active, searchInput);
          searchInput.focus();
        });
      }
    }
    // Form bindings. The Go templates emit these as <form data-...>
    // elements; we attach submit handlers and call the same YPGApi
    // helpers the JS-only render path uses.
    bindSigninForm();
    bindSignupForm();
    bindCreatePostForm();
    bindProfileForm();
    bindCommentFormFromSSR();
  }

  function applyClientFilters(activeTopics, searchInput) {
    const list = document.getElementById("post-list");
    if (!list) return;
    const searchValue = searchInput ? searchInput.value.trim().toLowerCase() : "";
    let visible = 0;
    list.querySelectorAll("article.post").forEach((article) => {
      const id = article.dataset.postId;
      const post = store.postById(id);
      if (!post) {
        article.hidden = true;
        return;
      }
      const matchesTopic = activeTopics.size === 0 || post.topicIds.some((t) => activeTopics.has(t));
      const matchesSearch = !searchValue || `${post.title} ${post.body} ${post.authorId}`.toLowerCase().includes(searchValue);
      const visible_ = matchesTopic && matchesSearch;
      article.hidden = !visible_;
      if (visible_) visible++;
    });
    // If everything is hidden, surface a quiet "no results" line so the
    // user knows the filter is doing something.
    let empty = list.querySelector("[data-empty-filter-state]");
    if (visible === 0) {
      if (!empty) {
        empty = document.createElement("section");
        empty.className = "empty-state";
        empty.dataset.emptyFilterState = "1";
        empty.innerHTML = "<h3>No posts match your filters</h3><p>Tap a topic chip again to clear it, or clear the search box.</p>";
        list.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function bindSigninForm() {
    const form = document.querySelector("[data-signin-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit.disabled) return;
      const errorEl = document.getElementById("signin-error");
      if (errorEl) errorEl.textContent = "";
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = "Signing in...";
      try {
        const fields = form.elements;
        await store.loginDemo({
          handle: fields.identifier.value.trim().replace(/^@/, ""),
          email: fields.identifier.value.trim(),
          password: fields.password.value
        });
        window.location.href = "/";
      } catch (err) {
        submit.disabled = false;
        submit.textContent = oldText;
        if (errorEl) errorEl.textContent = "Could not sign in with those credentials.";
      }
    });
  }

  function bindSignupForm() {
    const form = document.querySelector("[data-signup-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit.disabled) return;
      const errorEl = document.getElementById("signup-error");
      if (errorEl) errorEl.textContent = "";
      const fields = form.elements;
      if (fields.password.value !== fields.confirmPassword.value) {
        if (errorEl) errorEl.textContent = "Passwords must match.";
        return;
      }
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = "Creating...";
      try {
        const initials = (fields.initials.value || fields.name.value || "YP").trim().slice(0, 2).toUpperCase();
        await store.signupLocal({
          name: fields.name.value.trim(),
          handle: fields.handle.value.trim().replace(/^@/, ""),
          email: fields.email.value.trim(),
          password: fields.password.value,
          confirmPassword: fields.confirmPassword.value,
          year: fields.year.value,
          initials,
          avatarColor: fields.avatarColor.value,
          bio: fields.bio.value.trim()
        });
        window.location.href = "/profile.html";
      } catch (err) {
        submit.disabled = false;
        submit.textContent = oldText;
        if (errorEl) errorEl.textContent = "Could not create that account. The handle or email may already be taken.";
      }
    });
  }

  function bindCreatePostForm() {
    const form = document.querySelector("[data-create-post-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    const errorEl = document.getElementById("form-error");
    const topicInputs = [...form.querySelectorAll("input[name='topics']")];
    topicInputs.forEach((input) => {
      input.addEventListener("change", () => {
        const checked = topicInputs.filter((i) => i.checked);
        if (checked.length > 3) {
          input.checked = false;
          if (errorEl) errorEl.textContent = "Pick up to 3 topics only.";
        } else if (errorEl) {
          errorEl.textContent = "";
        }
      });
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit.disabled) return;
      const title = form.title.value.trim();
      const body = form.body.value.trim();
      const topicIds = topicInputs.filter((i) => i.checked).map((i) => i.value);
      if (!title || !body || topicIds.length === 0) {
        if (errorEl) errorEl.textContent = "Add a title, post text, and at least one topic.";
        return;
      }
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = "Posting...";
      try {
        const saved = await store.addPost({
          title, body, authorId: data.currentUserId, topicIds, score: 0, comments: 0, createdAt: "Just now"
        });
        window.location.href = `/post.html?id=${encodeURIComponent(saved.id)}`;
      } catch (err) {
        submit.disabled = false;
        submit.textContent = oldText;
        if (errorEl) errorEl.textContent = err?.message?.includes("401")
          ? "You need to sign in again before posting. Please refresh and sign in."
          : `Could not save that discussion. ${err.message || "Please try again in a moment."}`;
      }
    });
  }

  function bindProfileForm() {
    const form = document.querySelector("[data-profile-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit.disabled) return;
      const fields = form.elements;
      submit.disabled = true;
      try {
        await store.saveProfile({
          name: fields.name.value.trim() || data.currentUserId,
          handle: fields.handle.value.trim() || data.currentUserId,
          year: fields.year.value.trim(),
          initials: fields.initials.value.trim().toUpperCase(),
          avatarColor: fields.avatarColor.value,
          bio: fields.bio.value.trim()
        });
        const saved = document.getElementById("profile-saved");
        if (saved) saved.textContent = "Saved. Your profile is synced with the YPG backend.";
      } catch (err) {
        console.error("save profile failed", err);
      } finally {
        submit.disabled = false;
      }
    });
  }

  function bindCommentFormFromSSR() {
    const form = document.querySelector("[data-comment-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    const postId = form.dataset.postId;
    const errorEl = document.getElementById("comment-error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit.disabled) return;
      const body = form.body.value.trim();
      if (!body) {
        if (errorEl) errorEl.textContent = "Write a comment before posting.";
        return;
      }
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = "Posting...";
      try {
        await store.addComment(postId, {
          authorId: data.currentUserId, parentId: null, body, createdAt: "Just now"
        });
        window.location.reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = oldText;
        if (errorEl) errorEl.textContent = "Could not save that comment. Please try again.";
      }
    });
  }

  function renderInitError(error) {
    const app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = "";
    const panel = document.createElement("section");
    panel.className = "content-panel error-panel";
    const heading = document.createElement("h1");
    heading.textContent = "Loading failed";
    const message = document.createElement("p");
    message.textContent = "YPG Forum could not finish starting. Please refresh the page and check the browser console for YPG diagnostics.";
    const details = document.createElement("pre");
    details.className = "debug-message";
    details.textContent = String(error?.message || error || "Unknown error");
    panel.append(heading, message, details);
    app.append(panel);
  }

  async function init() {
    attachGlobalDebugHandlers();
    const app = document.getElementById("app");
    const page = app ? app.dataset.page || "home" : "home";
    const ssrPresent = hasServerRenderedShell();
    debug("init start", {
      path: window.location.pathname,
      search: window.location.search,
      page,
      appFound: Boolean(app),
      ssrPresent,
      dependencies: {
        data: Boolean(data),
        store: Boolean(store),
        render: Boolean(render)
      },
      dataset: app ? { ...app.dataset } : {}
    });

    // The fast-path: the server already rendered a complete page. We do
    // NOT wipe it, and we do NOT block on the backend. We just attach the
    // few interactive bindings (vote, follow) that the SSR shell cannot
    // hook up on its own. The "Loading YPG Forum…" message from the old
    // code path is gone from this branch entirely.
    if (ssrPresent) {
      try {
        bindInteractive();
        if (store.ready) {
          // Fire-and-forget: hydrate local cache with backend data, but
          // never let it block the page. If it fails or times out the
          // user already has working SSR content.
          Promise.resolve(store.ready()).catch((err) => {
            debug("store.ready failed (ignored):", err?.message || err);
          });
        }
        try {
          const authState = store.auth();
          if (authState && authState.blockedByClient) {
            showBlockedHint();
          }
        } catch (e) {}
      } catch (err) {
        console.warn(runtimePrefix, "ssr init failed", err);
      }
      return;
    }

    // The slow-path (no SSR shell present). Render a minimal loading
    // hint, kick off the backend probe, and proceed when it resolves.
    try {
      render.shell({ activePage: page, title: "", description: "", searchPlaceholder: "Loading..." });
      const pageContent = document.getElementById("page-content");
      if (pageContent) pageContent.innerHTML = '<div class="loading">Loading YPG Forum...</div>';
    } catch (err) {
      console.warn(runtimePrefix, "initial shell render failed", err);
    }

    try {
      if (store.ready) {
        await store.ready();
        debug("store ready", {
          backendAvailable: typeof store.isBackendAvailable === "function" ? store.isBackendAvailable() : "unknown",
          signedIn: typeof store.isSignedIn === "function" ? store.isSignedIn() : "unknown"
        });
      }
      if (!app) {
        console.warn(runtimePrefix, "#app element not found after startup - aborting page render.");
        return;
      }
      try {
        const authState = store.auth();
        if (authState && authState.blockedByClient) {
          showBlockedHint();
        }
      } catch (e) {}
      const nowPage = app.dataset.page || "home";
      debug("render route", {
        page: nowPage,
        topic: app.dataset.topic || params().get("id") || null
      });
      if (nowPage === "home") renderFeedPage({ mode: "home" });
      if (nowPage === "following") renderFeedPage({ mode: "following" });
      if (nowPage === "topic") renderFeedPage({ mode: "topic", topicId: app.dataset.topic || params().get("id") || "metaphysics" });
      if (nowPage === "create") renderCreatePost();
      if (nowPage === "profile") renderProfile();
      if (nowPage === "settings") renderSettings();
      if (nowPage === "account") renderAccount();
      if (nowPage === "user") renderUserProfile();
      if (nowPage === "messages") renderMessages();
      if (nowPage === "signin") renderSignin();
      if (nowPage === "signup") renderSignup();
      if (nowPage === "post") renderPostPage();
    } catch (error) {
      console.error(runtimePrefix, "init failed", error);
      renderInitError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    debug("DOMContentLoaded");
    init();
  });
})();
