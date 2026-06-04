(function () {
  const prefix = "ypg-forum:";
  const keys = {
    posts: `${prefix}posts`,
    follows: `${prefix}follows`,
    votes: `${prefix}votes`,
    profile: `${prefix}profile`,
    users: `${prefix}users`,
    auth: `${prefix}auth`,
    settings: `${prefix}settings`,
    conversations: `${prefix}conversations`,
    comments: `${prefix}comments`
  };
  const api = window.YPGApi;
  let backendAvailable = false;
  let sessionUserId = window.YPG_DATA.currentUserId;
  let readyPromise = null;

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function persist(path, payload) {
    if (!backendAvailable || !api || typeof path !== "function") return;
    path(payload).catch(() => {
      backendAvailable = false;
    });
  }

  function hydrateFromBackend(state, userId) {
    if (!state) return;
    sessionUserId = userId || sessionUserId;
    window.YPG_DATA.currentUserId = sessionUserId;
    if (Array.isArray(state.users)) {
      write(keys.users, state.users);
      window.YPG_DATA.users = state.users.length ? state.users : window.YPG_DATA.users;
    }
    if (Array.isArray(state.posts)) write(keys.posts, state.posts);
    if (state.comments) write(keys.comments, state.comments);
    if (state.votes) write(keys.votes, state.votes);
    if (state.profiles && state.profiles[sessionUserId]) write(keys.profile, state.profiles[sessionUserId]);
    if (state.settings && state.settings[sessionUserId]) write(keys.settings, state.settings[sessionUserId]);
    if (state.follows && state.follows[sessionUserId]) write(keys.follows, state.follows[sessionUserId]);
    if (Array.isArray(state.conversations) && state.conversations.length) write(keys.conversations, state.conversations);
  }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = api ? api.session()
      .then((session) => {
        backendAvailable = true;
        hydrateFromBackend(session.state, session.userId);
        write(keys.auth, { signedIn: session.signedIn === true, backend: true });
      })
      .catch(() => {
        backendAvailable = false;
      }) : Promise.resolve();
    return readyPromise;
  }

  function customPosts() {
    return read(keys.posts, []);
  }

  function auth() {
    return read(keys.auth, { signedIn: false, localAccount: null });
  }

  function isSignedIn() {
    return auth().signedIn !== false;
  }

  function loginDemo(credentials = {}) {
    if (api) {
      return api.login(credentials).then((session) => {
        write(keys.auth, { ...auth(), signedIn: true });
        sessionUserId = session.userId || sessionUserId;
        window.YPG_DATA.currentUserId = sessionUserId;
        return session;
      });
    }
    write(keys.auth, { ...auth(), signedIn: true });
    return Promise.resolve();
  }

  function logoutDemo() {
    write(keys.auth, { ...auth(), signedIn: false });
    if (api) api.logout().catch(() => {});
  }

  function signupLocal(account) {
    if (api) {
      return api.signup(account).then((session) => {
        write(keys.auth, { signedIn: true, backend: true });
        sessionUserId = session.userId || account.handle;
        window.YPG_DATA.currentUserId = sessionUserId;
        if (session.profile) write(keys.profile, session.profile);
        return session;
      });
    }
    write(keys.auth, { signedIn: true, localAccount: account });
    saveProfile(account);
    return Promise.resolve();
  }

  function allPosts() {
    return [...customPosts(), ...window.YPG_DATA.posts];
  }

  async function addPost(post) {
    const saved = api ? await api.createPost(post) : post;
    const posts = customPosts();
    posts.unshift(saved);
    write(keys.posts, posts);
    return saved;
  }

  function postById(postId) {
    return allPosts().find((post) => post.id === postId);
  }

  function follows() {
    return read(keys.follows, []);
  }

  function isFollowing(userId) {
    return follows().includes(userId);
  }

  function toggleFollow(userId) {
    const currentUserId = window.YPG_DATA.currentUserId;
    if (!userId || userId === currentUserId) return follows();
    const next = isFollowing(userId)
      ? follows().filter((id) => id !== userId)
      : [...follows(), userId];
    write(keys.follows, next);
    persist(api?.toggleFollow, userId);
    return next;
  }

  function votes() {
    return read(keys.votes, {});
  }

  function voteFor(postId) {
    const value = votes()[postId];
    return typeof value === "string" ? value : value?.direction || null;
  }

  function scoreFor(post) {
    const vote = voteFor(post.id);
    if (vote === "up") return post.score + 1;
    if (vote === "down") return post.score - 1;
    return post.score;
  }

  function toggleVote(postId, direction) {
    const currentUserId = window.YPG_DATA.currentUserId;
    const next = votes();
    const currentDirection = voteFor(postId);
    if (currentDirection === direction) {
      delete next[postId];
    } else {
      next[postId] = {
        postId,
        userId: currentUserId,
        direction,
        updatedAt: new Date().toISOString()
      };
    }
    write(keys.votes, next);
    if (api) api.toggleVote(postId, direction).catch(() => {});
  }

  function comments() {
    return read(keys.comments, {});
  }

  function commentsForPost(postId) {
    return comments()[postId] || [];
  }

  async function addComment(postId, comment) {
    if (api) {
      const saved = await api.addComment(postId, comment);
      const next = comments();
      next[postId] = saved;
      write(keys.comments, next);
      return saved;
    }
    const next = comments();
    next[postId] = [...(next[postId] || []), { parentId: null, ...comment }];
    write(keys.comments, next);
    return next[postId];
  }

  function commentCountFor(post) {
    return (post.comments || 0) + commentsForPost(post.id).length;
  }

  function followersFor(userId) {
    if (userId === window.YPG_DATA.currentUserId) {
      return [];
    }
    return [];
  }

  function followingUsers() {
    return follows()
      .map((id) => window.YPG_DATA.users.find((user) => user.id === id))
      .filter(Boolean);
  }

  function profile() {
    const authState = auth();
    return {
      name: "YPG Member",
      handle: window.YPG_DATA.currentUserId || "guest",
      initials: "YP",
      avatarColor: "#27304f",
      year: "YPG",
      bio: "",
      interests: [],
      ...(authState.localAccount || {}),
      ...read(keys.profile, {})
    };
  }

  function saveProfile(updates) {
    const next = { ...profile(), ...updates };
    write(keys.profile, next);
    persist(api?.saveProfile, next);
    return next;
  }

  async function uploadProfilePicture(file) {
    if (!api) throw new Error("backend unavailable");
    const result = await api.uploadProfilePicture(file);
    if (result.profile) write(keys.profile, result.profile);
    else if (result.avatarImage) saveProfile({ avatarImage: result.avatarImage });
    return result.avatarImage || result.profile?.avatarImage;
  }

  function settings() {
    return { ...window.YPG_DATA.settingsDefaults, ...read(keys.settings, {}) };
  }

  function saveSettings(updates) {
    const next = { ...settings(), ...updates };
    write(keys.settings, next);
    persist(api?.saveSettings, next);
    return next;
  }

  function conversations() {
    const saved = read(keys.conversations, null);
    return saved || window.YPG_DATA.conversations;
  }

  function saveConversations(next) {
    write(keys.conversations, next);
    persist(api?.saveConversations, next);
  }

  function sendMessage(userId, body) {
    const currentUserId = window.YPG_DATA.currentUserId;
    const all = conversations();
    let conversation = all.find((item) => item.participantIds.includes(userId) && item.participantIds.includes(currentUserId));
    if (!conversation) {
      conversation = {
        id: `chat-${userId}`,
        participantIds: [currentUserId, userId],
        unread: false,
        messages: []
      };
      all.unshift(conversation);
    }
    conversation.messages.push({
      id: `msg-${Date.now()}`,
      senderId: currentUserId,
      body,
      timestamp: "Just now",
      read: true
    });
    conversation.unread = false;
    saveConversations(all);
    return conversation;
  }

  function conversationWith(userId) {
    const currentUserId = window.YPG_DATA.currentUserId;
    const all = conversations();
    let conversation = all.find((item) => item.participantIds.includes(userId) && item.participantIds.includes(currentUserId));
    if (!conversation && userId && userId !== currentUserId) {
      conversation = {
        id: `chat-${userId}`,
        participantIds: [currentUserId, userId],
        unread: false,
        messages: []
      };
      saveConversations([conversation, ...all]);
    }
    return conversation;
  }

  function resetBrowserCache() {
    Object.values(keys).forEach((key) => localStorage.removeItem(key));
  }

  function exportLocalData() {
    return {
      auth: auth(),
      profile: profile(),
      settings: settings(),
      users: read(keys.users, window.YPG_DATA.users),
      follows: follows(),
      posts: customPosts(),
      comments: comments(),
      votes: votes(),
      conversations: conversations()
    };
  }

  window.YPGStore = {
    ready,
    auth,
    isSignedIn,
    loginDemo,
    logoutDemo,
    signupLocal,
    allPosts,
    addPost,
    postById,
    follows,
    isFollowing,
    toggleFollow,
    voteFor,
    scoreFor,
    toggleVote,
    commentsForPost,
    addComment,
    commentCountFor,
    followersFor,
    followingUsers,
    profile,
    saveProfile,
    uploadProfilePicture,
    settings,
    saveSettings,
    conversations,
    conversationWith,
    sendMessage,
    resetBrowserCache,
    exportLocalData
  };
})();
