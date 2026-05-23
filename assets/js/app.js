(function () {
  const data = window.YPG_DATA;
  const store = window.YPGStore;
  const render = window.YPGRender;
  let currentPage = null;
  let currentTopicId = null;

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
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = form.title.value.trim();
      const body = form.body.value.trim();
      const topicIds = topicInputs.filter((item) => item.checked).map((item) => item.value);
      if (!title || !body || topicIds.length === 0) {
        error.textContent = "Add a title, post text, and at least one topic.";
        return;
      }
      const post = {
        id: `local-${Date.now()}`,
        title,
        body,
        authorId: data.currentUserId,
        topicIds,
        score: 0,
        comments: 0,
        createdAt: "Just now"
      };
      store.addPost(post);
      window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
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
          ${comments.length ? render.threadedComments(comments) : render.emptyState("No local comments yet", "Start the discussion with a thoughtful reply.")}
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

  function submitComment(postId, form, parentId = null) {
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
    store.addComment(postId, {
      id: `comment-${Date.now()}`,
      authorId: data.currentUserId,
      parentId,
      body,
      createdAt: "Just now"
    });
    renderPostPage();
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
          <div class="field"><label for="profile-image">Profile picture URL</label><input id="profile-image" name="avatarImage" type="url" value="${render.escapeHtml(me.avatarImage || "")}" placeholder="Optional image URL"></div>
          <div class="field"><label for="profile-bio">Bio</label><textarea id="profile-bio" name="bio">${render.escapeHtml(me.bio)}</textarea></div>
          <div class="form-actions"><button class="button primary" type="submit">Save Settings</button><a class="button" href="following.html">Open Following Feed</a></div>
          <p class="success-note" id="profile-saved" aria-live="polite"></p>
        </form>
      </section>
      <section class="settings-grid">
        <article class="settings-panel"><h3>Message controls</h3>
          <label class="setting-row">Who can message me <select id="message-permission"><option value="everyone">Everyone</option><option value="followers">People I follow</option><option value="none">No one</option></select></label>
          <label class="setting-row"><span>Message requests</span><input id="message-requests" type="checkbox"></label>
          <label class="setting-row"><span>Read receipts</span><input id="read-receipts" type="checkbox"></label>
          <label class="setting-row"><span>Quiet hours</span><input id="quiet-hours" type="checkbox"></label>
        </article>
        <article class="settings-panel"><h3>Notifications</h3>
          <label class="setting-row"><span>Replies</span><input id="reply-notifications" type="checkbox"></label>
          <label class="setting-row"><span>New followers</span><input id="follow-notifications" type="checkbox"></label>
          <label class="setting-row"><span>Email updates</span><input id="email-notifications" type="checkbox"></label>
        </article>
        <article class="settings-panel"><h3>Privacy & appearance</h3>
          <label class="setting-row">Profile visibility <select id="profile-visibility"><option value="school">MHS students</option><option value="public">Public</option><option value="private">Private</option></select></label>
          <label class="setting-row">Appearance <select id="appearance"><option value="system">System</option><option value="light">Light</option><option value="focus">Focus mode</option></select></label>
          <label class="setting-row"><span>Show online status</span><input id="show-online-status" type="checkbox"></label>
        </article>
        <article class="settings-panel"><h3>Account</h3><p class="quiet">Manage followers, logout, export, and reset from the account page.</p><a class="button" href="account.html">Open Account</a></article>
      </section>`;
    hydrateSettings(settings);
    document.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById("profile-color").value = button.dataset.color;
      });
    });
    document.getElementById("profile-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = event.target.elements;
      const saved = store.saveProfile({
        name: fields.name.value.trim() || me.name,
        handle: fields.handle.value.trim() || me.handle,
        year: fields.year.value.trim() || me.year,
        initials: fields.initials.value.trim().toUpperCase() || me.initials,
        avatarColor: fields.avatarColor.value || me.avatarColor,
        avatarImage: fields.avatarImage.value.trim(),
        bio: fields.bio.value.trim() || me.bio
      });
      document.getElementById("profile-saved").textContent = "Saved. Your profile details are stored in this browser.";
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
    const logout = document.getElementById("logout-demo");
    if (logout) logout.addEventListener("click", () => {
      store.logoutDemo();
      window.location.href = "signin.html";
    });
    const reset = document.getElementById("reset-data");
    if (reset) reset.addEventListener("click", () => {
      store.resetLocalDemoData();
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
        <div><h3>${render.escapeHtml(me.name)}</h3><p>@${render.escapeHtml(me.handle)}</p><p class="quiet">Account controls, local demo data, followers, and following.</p></div>
        <div class="profile-actions"><a class="follow" href="settings.html">Settings</a><a class="follow muted-follow" href="profile.html">Profile</a></div>
      </section>
      <section class="follow-grid">
        <article class="settings-panel"><h3>Following</h3>${following.length ? following.map((user) => `<a class="followed-user" href="user.html?id=${encodeURIComponent(user.id)}">${render.avatar(user, "small")}<span>${render.escapeHtml(user.name)}</span></a>`).join("") : `<p class="quiet">You are not following anyone yet.</p>`}</article>
        <article class="settings-panel"><h3>Followers</h3>${followers.length ? followers.map((user) => `<a class="followed-user" href="user.html?id=${encodeURIComponent(user.id)}">${render.avatar(user, "small")}<span>${render.escapeHtml(user.name)}</span></a>`).join("") : `<p class="quiet">No followers yet.</p>`}</article>
      </section>
      <section class="settings-grid">
        <article class="settings-panel danger-zone"><h3>Account actions</h3>
          <button class="button danger" type="button" id="logout-demo">Log Out</button>
          <button class="button" type="button" id="reset-data">Reset Local Demo Data</button>
          <button class="button" type="button" id="export-data">Preview Local Data</button>
          <pre class="data-preview" id="data-preview"></pre>
        </article>
        <article class="settings-panel"><h3>Demo auth</h3><p class="quiet">This prototype stores account state in this browser. A backend can replace these helpers later.</p><a class="button" href="signin.html">Sign In Page</a><a class="button" href="signup.html">Sign Up Page</a></article>
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
      description: "Direct message shells are ready for backend connection."
    });
    document.getElementById("page-content").innerHTML = `
      <section class="messages-layout">
        <aside class="chat-list">
        ${store.conversations().map((conversation) => {
          const userId = conversation.participantIds.find((id) => id !== data.currentUserId);
          const user = render.userById(userId);
          const last = conversation.messages[conversation.messages.length - 1];
          return `<a class="message-card ${userId === other.id ? "active" : ""}" href="messages.html?chat=${encodeURIComponent(userId)}">${render.avatar(user)}<div><strong>${render.escapeHtml(user.name)}</strong><p>${render.escapeHtml(last?.body || "Start a conversation")}</p></div><span class="pill">${conversation.unread ? "New" : "Open"}</span></a>`;
        }).join("")}
        </aside>
        <article class="chat-shell">
          <header class="chat-head">${render.avatar(other)}<div><strong>${render.escapeHtml(other.name)}</strong><p>@${render.escapeHtml(other.handle)}</p></div></header>
          <div class="chat-messages">
            ${(selected?.messages || []).map((message) => {
              const mine = message.senderId === data.currentUserId;
              return `<div class="chat-bubble ${mine ? "mine" : ""}"><p>${render.escapeHtml(message.body)}</p><span>${render.escapeHtml(message.timestamp)}</span></div>`;
            }).join("") || render.emptyState("No messages yet", "This chat is ready for backend message delivery.")}
          </div>
          <form class="chat-compose"><input disabled placeholder="Messaging is ready for backend connection."><button class="button" disabled type="button">Send</button></form>
          <p class="soft-note">The UI creates/selects conversations now; real sending can connect to a backend API later.</p>
        </article>
      </section>`;
    bindInteractive();
  }

  function renderSignin() {
    currentPage = "signin";
    render.shell({
      activePage: "signin",
      title: "Sign In",
      description: "Use demo sign in for now. Real authentication can connect later.",
      actionLabel: "Back to Feed",
      actionHref: "index.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="auth-card">
        <h3>Welcome back</h3>
        <p>Sign in to post, follow, vote, and open direct messages.</p>
        <div class="field"><label>Email or handle</label><input type="text" placeholder="you@mhs or @you"></div>
        <div class="field"><label>Password</label><input type="password" placeholder="Demo only"></div>
        <div class="form-actions"><button class="button primary" type="button" id="demo-login">Log in as demo user</button><a class="button" href="signup.html">Create account</a></div>
      </section>`;
    document.getElementById("demo-login").addEventListener("click", () => {
      store.loginDemo();
      window.location.href = "index.html";
    });
  }

  function renderSignup() {
    currentPage = "signup";
    render.shell({
      activePage: "signup",
      title: "Sign Up",
      description: "Create a local demo account for this prototype.",
      actionLabel: "Back to Feed",
      actionHref: "index.html"
    });
    document.getElementById("page-content").innerHTML = `
      <section class="auth-card">
        <form class="form-grid" id="signup-form">
          <div class="field"><label>Display name</label><input name="name" required placeholder="MHS Philosopher"></div>
          <div class="field"><label>Handle</label><input name="handle" required placeholder="yourhandle"></div>
          <div class="field"><label>Year/group</label><select name="year">${data.signupYears.map((year) => `<option>${year}</option>`).join("")}</select></div>
          <div class="field"><label>Avatar initials</label><input name="initials" maxlength="3" placeholder="YP"></div>
          <div class="field"><label>Avatar color</label><input name="avatarColor" type="color" value="${data.avatarPresets[0]}"></div>
          <div class="field"><label>Bio</label><textarea name="bio" placeholder="What kind of philosophy are you interested in?"></textarea></div>
          <div class="form-actions"><button class="button primary" type="submit">Create demo account</button><a class="button" href="signin.html">I already have one</a></div>
        </form>
      </section>`;
    document.getElementById("signup-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = event.target.elements;
      store.signupLocal({
        name: fields.name.value.trim(),
        handle: fields.handle.value.trim().replace(/^@/, ""),
        year: fields.year.value,
        initials: (fields.initials.value.trim() || fields.name.value.trim().slice(0, 2)).toUpperCase(),
        avatarColor: fields.avatarColor.value,
        bio: fields.bio.value.trim() || "New YPG member, ready to discuss better questions."
      });
      window.location.href = "profile.html";
    });
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
      button.addEventListener("click", () => {
        store.toggleFollow(button.dataset.followUser);
        refreshCurrentPage();
      });
    });
    document.querySelectorAll("[data-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        const postId = button.dataset.postId;
        store.toggleVote(postId, button.dataset.vote);
        refreshCurrentPage();
      });
    });
  }

  function init() {
    const app = document.getElementById("app");
    const page = app.dataset.page || "home";
    if (page === "home") renderFeedPage({ mode: "home" });
    if (page === "following") renderFeedPage({ mode: "following" });
    if (page === "topic") renderFeedPage({ mode: "topic", topicId: app.dataset.topic || params().get("id") || "metaphysics" });
    if (page === "create") renderCreatePost();
    if (page === "profile") renderProfile();
    if (page === "settings") renderSettings();
    if (page === "account") renderAccount();
    if (page === "user") renderUserProfile();
    if (page === "messages") renderMessages();
    if (page === "signin") renderSignin();
    if (page === "signup") renderSignup();
    if (page === "post") renderPostPage();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
