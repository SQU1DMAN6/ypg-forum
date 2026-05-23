(function () {
  const prefix = "ypg-forum:";
  const keys = {
    posts: `${prefix}posts`,
    follows: `${prefix}follows`,
    votes: `${prefix}votes`,
    profile: `${prefix}profile`,
    auth: `${prefix}auth`,
    settings: `${prefix}settings`,
    conversations: `${prefix}conversations`,
    comments: `${prefix}comments`
  };

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

  function customPosts() {
    return read(keys.posts, []);
  }

  function auth() {
    return read(keys.auth, { signedIn: true, localAccount: null });
  }

  function isSignedIn() {
    return auth().signedIn !== false;
  }

  function loginDemo() {
    write(keys.auth, { ...auth(), signedIn: true });
  }

  function logoutDemo() {
    write(keys.auth, { ...auth(), signedIn: false });
  }

  function signupLocal(account) {
    write(keys.auth, { signedIn: true, localAccount: account });
    saveProfile(account);
  }

  function allPosts() {
    return [...customPosts(), ...window.YPG_DATA.posts];
  }

  function addPost(post) {
    const posts = customPosts();
    posts.unshift(post);
    write(keys.posts, posts);
  }

  function postById(postId) {
    return allPosts().find((post) => post.id === postId);
  }

  function follows() {
    return read(keys.follows, ["futsali", "mhsthinker"]);
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
  }

  function comments() {
    return read(keys.comments, {});
  }

  function commentsForPost(postId) {
    return comments()[postId] || [];
  }

  function addComment(postId, comment) {
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
      return window.YPG_DATA.users
        .filter((user) => user.id !== userId)
        .filter((user) => ["futsali", "mhsthinker", "socratease"].includes(user.id));
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
    return { ...(authState.localAccount || {}), ...read(keys.profile, {}) };
  }

  function saveProfile(updates) {
    const next = { ...profile(), ...updates };
    write(keys.profile, next);
    return next;
  }

  function settings() {
    return { ...window.YPG_DATA.settingsDefaults, ...read(keys.settings, {}) };
  }

  function saveSettings(updates) {
    const next = { ...settings(), ...updates };
    write(keys.settings, next);
    return next;
  }

  function conversations() {
    const saved = read(keys.conversations, null);
    return saved || window.YPG_DATA.conversations;
  }

  function saveConversations(next) {
    write(keys.conversations, next);
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

  function resetLocalDemoData() {
    Object.values(keys).forEach((key) => localStorage.removeItem(key));
  }

  function exportLocalData() {
    return {
      auth: auth(),
      profile: profile(),
      settings: settings(),
      follows: follows(),
      posts: customPosts(),
      comments: comments(),
      votes: votes(),
      conversations: conversations()
    };
  }

  window.YPGStore = {
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
    settings,
    saveSettings,
    conversations,
    conversationWith,
    resetLocalDemoData,
    exportLocalData
  };
})();
