(function () {
  const topics = [
    { id: "metaphysics", label: "Metaphysics", color: "#f7d5d8", description: "Reality, identity, time, free will, and what exists." },
    { id: "ethics", label: "Ethics", color: "#d9f5cf", description: "Right action, responsibility, harm, duty, and justice." },
    { id: "logic", label: "Logic", color: "#faf5cf", description: "Arguments, validity, fallacies, and clearer reasoning." },
    { id: "aesthetics", label: "Aesthetics", color: "#d7ebff", description: "Art, beauty, taste, creativity, and interpretation." },
    { id: "epistemology", label: "Epistemology", color: "#ffe2bd", description: "Knowledge, belief, evidence, doubt, and truth." },
    { id: "politics", label: "Politics", color: "#d8dcff", description: "Power, rights, law, citizenship, and social order." },
    { id: "mind", label: "Mind", color: "#d7f6ef", description: "Consciousness, personal identity, thought, and experience." },
    { id: "religion", label: "Religion", color: "#eadcff", description: "Faith, God, meaning, ritual, and religious argument." }
  ];

  const users = [
    {
      id: "guest",
      name: "YPG Member",
      handle: "guest",
      initials: "YP",
      avatarColor: "#27304f",
      year: "YPG",
      bio: "",
      interests: []
    }
  ];

  const posts = [];

  const messages = [];

  const conversations = [];

  const settingsDefaults = {
    messagePermission: "followers",
    messageRequests: true,
    readReceipts: true,
    quietHours: false,
    emailNotifications: false,
    replyNotifications: true,
    followNotifications: true,
    appearance: "system",
    profileVisibility: "school",
    showOnlineStatus: true,
    blockedUsers: []
  };

  const avatarPresets = ["#27304f", "#2e3e69", "#47735f", "#796236", "#795153", "#3f6f8f", "#6d4c8d", "#315b5a"];

  const signupYears = ["Year 9", "Year 10", "Year 11", "Year 12", "Teacher"];

  window.YPG_DATA = {
    currentUserId: "guest",
    topics,
    users,
    posts,
    messages,
    conversations,
    settingsDefaults,
    avatarPresets,
    signupYears
  };
})();
