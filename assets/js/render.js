(function () {
  const data = () => window.YPG_DATA;
  const store = () => window.YPGStore;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function topicById(id) {
    return data().topics.find((topic) => topic.id === id);
  }

  function userById(id) {
    const base = data().users.find((user) => user.id === id) || data().users[0];
    if (id === data().currentUserId) {
      return { ...base, ...store().profile() };
    }
    return base;
  }

  function isSignedIn() {
    return store().isSignedIn();
  }

  function pageLinkForTopic(topic) {
    const oldPages = ["metaphysics", "ethics", "logic", "aesthetics"];
    return oldPages.includes(topic.id) ? `${topic.id}.html` : `topic.html?id=${topic.id}`;
  }

  function avatar(user, sizeClass = "") {
    const image = user.avatarImage ? `background-image:url('${escapeHtml(user.avatarImage)}')` : "";
    return `<span class="avatar ${sizeClass} ${user.avatarImage ? "has-image" : ""}" style="--avatar-color:${escapeHtml(user.avatarColor)};${image}">${user.avatarImage ? "" : escapeHtml(user.initials || user.name.slice(0, 2))}</span>`;
  }

  function userLink(user, className = "user-link") {
    const href = `user.html?id=${encodeURIComponent(user.id)}`;
    return `<a class="${className}" href="${href}">${avatar(user)}<span>${escapeHtml(user.name)}</span></a>`;
  }

  function topicTags(topicIds) {
    return topicIds.map((id) => {
      const topic = topicById(id);
      if (!topic) return "";
      return `<a class="tag" href="${pageLinkForTopic(topic)}" style="--tag-color:${topic.color}">${escapeHtml(topic.label)}</a>`;
    }).join("");
  }

  function followButton(userId) {
    if (!isSignedIn()) {
      return `<a class="follow muted-follow" href="signin.html">Sign in to follow</a>`;
    }
    if (userId === data().currentUserId) {
      return `<a class="follow muted-follow" href="profile.html">Your profile</a>`;
    }
    const active = store().isFollowing(userId);
    return `<button class="follow ${active ? "following" : ""}" type="button" data-follow-user="${escapeHtml(userId)}">${active ? "Following" : "Follow"}</button>`;
  }

  function messageButton(userId) {
    if (userId === data().currentUserId) return "";
    if (!isSignedIn()) return `<a class="follow muted-follow" href="signin.html">Sign in to message</a>`;
    return `<a class="follow message-action" href="messages.html?chat=${encodeURIComponent(userId)}">Message</a>`;
  }

  function postLink(post) {
    return `post.html?id=${encodeURIComponent(post.id)}`;
  }

  function voteControls(post, extraClass = "") {
    const vote = store().voteFor(post.id);
    return `
      <div class="vote ${extraClass}">
        <button class="vote-btn ${vote === "up" ? "active" : ""}" type="button" data-vote="up" data-post-id="${escapeHtml(post.id)}">&uarr;</button>
        <span data-score-for="${escapeHtml(post.id)}">${store().scoreFor(post)}</span>
        <button class="vote-btn ${vote === "down" ? "active down" : ""}" type="button" data-vote="down" data-post-id="${escapeHtml(post.id)}">&darr;</button>
      </div>`;
  }

  function postCard(post) {
    const author = userById(post.authorId);
    const href = postLink(post);
    return `
      <article class="post" style="--post-color:${topicById(post.topicIds[0])?.color || "#ececec"}" data-post-id="${escapeHtml(post.id)}">
        <div class="post-inner">
          <div class="post-head">
            ${userLink(author, "user")}
            ${followButton(author.id)}
            <div class="post-meta"><span>${escapeHtml(post.createdAt)}</span><span>${store().commentCountFor(post)} comments</span></div>
          </div>
          <a class="post-content post-card-link" href="${href}">
            <div class="tag-row">${topicTags(post.topicIds)}</div>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.body)}</p>
          </a>
          <div class="post-footer">
            ${voteControls(post)}
          </div>
        </div>
      </article>`;
  }

  function postDetail(post) {
    const author = userById(post.authorId);
    return `
      <article class="post-detail" style="--post-color:${topicById(post.topicIds[0])?.color || "#ececec"}">
        <header class="post-detail-head">
          ${userLink(author, "user")}
          <div class="profile-actions">${followButton(author.id)}${messageButton(author.id)}</div>
        </header>
        <div class="tag-row">${topicTags(post.topicIds)}</div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.body)}</p>
        <footer class="post-detail-footer">
          ${voteControls(post, "large-vote")}
          <span>${escapeHtml(post.createdAt)}</span>
          <span>${store().commentCountFor(post)} comments</span>
        </footer>
      </article>`;
  }

  function commentCard(comment) {
    const author = userById(comment.authorId);
    return `
      <article class="comment-card" id="comment-${escapeHtml(comment.id)}">
        <header>${userLink(author, "user")}<span>${escapeHtml(comment.createdAt)}</span></header>
        <p>${escapeHtml(comment.body)}</p>
        ${isSignedIn() ? `<button class="reply-link" type="button" data-reply-to="${escapeHtml(comment.id)}">Reply</button>` : ""}
      </article>`;
  }

  function threadedComments(comments, parentId = null, depth = 0) {
    const children = comments.filter((comment) => (comment.parentId || null) === parentId);
    if (!children.length) return "";
    return `<div class="comment-thread ${depth ? "nested" : ""}">
      ${children.map((comment) => `
        <div class="comment-node">
          ${commentCard(comment)}
          <div class="reply-slot" data-reply-slot="${escapeHtml(comment.id)}"></div>
          ${threadedComments(comments, comment.id, depth + 1)}
        </div>`).join("")}
    </div>`;
  }

  function relatedPostCard(post) {
    const author = userById(post.authorId);
    return `
      <a class="related-post" href="${postLink(post)}" style="--post-color:${topicById(post.topicIds[0])?.color || "#ececec"}">
        <span>${escapeHtml(author.name)}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <small>${store().commentCountFor(post)} comments</small>
      </a>`;
  }

  function emptyState(title, text) {
    return `<section class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></section>`;
  }

  function sidebar(activeTopicId, activePage) {
    const topicLinks = data().topics.map((topic) => `
      <a class="topic ${activeTopicId === topic.id ? "active" : ""}" href="${pageLinkForTopic(topic)}" style="--topic-color:${topic.color}">
        <span class="dot"></span>${escapeHtml(topic.label)}
      </a>`).join("");
    const conversations = store().conversations().slice(0, 5).map((conversation) => {
      const otherId = conversation.participantIds.find((id) => id !== data().currentUserId);
      const user = userById(otherId);
      const last = conversation.messages[conversation.messages.length - 1];
      return `<a class="dm-preview ${conversation.unread ? "unread" : ""}" href="messages.html?chat=${encodeURIComponent(otherId)}">
        ${avatar(user)}
        <span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(last?.body || "Start a conversation")}</small></span>
      </a>`;
    }).join("");

    return `
      <aside class="left">
        <div class="brand">
          <a class="logo" href="index.html" aria-label="Young Philosophers home"></a>
          <div class="brand-copy"><h1>MHS YPG</h1></div>
        </div>
        <nav class="sidebar-card" aria-label="Forum sections">
          <div class="topic-list">
            <a class="topic all ${activePage === "home" ? "active" : ""}" href="index.html"><span class="dot"></span>General (All)</a>
            ${topicLinks}
            <a class="topic all ${activePage === "following" ? "active" : ""}" href="following.html"><span class="dot"></span>Following Feed</a>
          </div>
          <div class="divider"></div>
          <div class="section-label">Direct Messages</div>
          <div class="dm-list">${isSignedIn() ? conversations : `<a class="dm-preview" href="signin.html"><span><strong>Sign in</strong><small>Open your direct messages</small></span></a>`}</div>
        </nav>
      </aside>`;
  }

  function rightSidebar() {
    const followedIds = store().follows();
    const followedUsers = followedIds.map(userById).filter(Boolean);
    const followedPosts = store().allPosts().filter((post) => followedIds.includes(post.authorId));
    const followedMarkup = followedUsers.length
      ? followedUsers.map((user) => `<a class="followed-user" href="user.html?id=${encodeURIComponent(user.id)}">${avatar(user, "small")}<span>${escapeHtml(user.name)}</span></a>`).join("")
      : `<p class="quiet">Follow people to build this feed.</p>`;
    const postMarkup = followedPosts.length
      ? followedPosts.map((post) => {
        const topic = topicById(post.topicIds[0]);
        const author = userById(post.authorId);
        return `<a class="trend-card" href="${postLink(post)}" style="--post-color:${topic?.color || "#ececec"}">
          <div class="trend-head">${avatar(author, "small")}<span>${escapeHtml(author.name)}</span></div>
          <h3 class="trend-title">${escapeHtml(post.title)}</h3>
          <p class="trend-text">${escapeHtml(post.body)}</p>
          <div class="trend-vote">&uarr; ${store().scoreFor(post)} &middot; ${store().commentCountFor(post)} comments</div>
        </a>`;
      }).join("")
      : `<section class="trend-card"><h3 class="trend-title">No followed posts yet</h3><p class="trend-text">Follow another member from a post or profile to fill this area.</p></section>`;

    return `
      <aside class="right">
        <div class="right-title">Following</div>
        <div class="followed-list">${followedMarkup}</div>
        <div class="right-title second">Recent from followed</div>
        <div class="trending">${postMarkup}</div>
      </aside>`;
  }

  function topbar(actionLabel = "+ Create Post", actionHref = "create-post.html", searchPlaceholder = "Search discussions, authors, arguments...") {
    const me = userById(data().currentUserId);
    const publicAction = actionHref === "index.html";
    const authControls = isSignedIn()
      ? `<a class="profile" href="profile.html" aria-label="Profile and settings">${avatar(me, "profile-avatar")}</a>`
      : `<div class="auth-actions"><a class="button compact" href="signin.html">Sign In</a><a class="button compact primary" href="signup.html">Sign Up</a></div>`;
    return `
      <div class="topbar">
        <a class="create-post ${isSignedIn() || publicAction ? "" : "disabled-link"}" href="${isSignedIn() || publicAction ? actionHref : "signin.html"}">${escapeHtml(isSignedIn() || publicAction ? actionLabel : "Sign in to post")}</a>
        <form class="search" role="search" data-search-form>
          <input type="search" data-search-input placeholder="${escapeHtml(searchPlaceholder)}">
          <button class="clear-search" type="button" data-clear-search aria-label="Clear search">x</button>
        </form>
        ${authControls}
      </div>`;
  }

  function shell(options) {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="app">
        ${sidebar(options.activeTopicId, options.activePage)}
        <main class="main">
          ${topbar(options.actionLabel, options.actionHref, options.searchPlaceholder)}
          <div id="page-content"></div>
        </main>
        ${rightSidebar()}
      </div>`;
  }

  window.YPGRender = {
    escapeHtml,
    topicById,
    userById,
    pageLinkForTopic,
    avatar,
    userLink,
    topicTags,
    followButton,
    messageButton,
    postLink,
    postCard,
    postDetail,
    commentCard,
    threadedComments,
    relatedPostCard,
    emptyState,
    shell,
    rightSidebar
  };
})();
