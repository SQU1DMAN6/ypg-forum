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
      id: "you",
      name: "MHS Philosopher",
      handle: "you",
      initials: "YP",
      avatarColor: "#27304f",
      year: "Year 10",
      bio: "Building stronger arguments and asking better questions with YPG.",
      interests: ["logic", "ethics", "epistemology"]
    },
    {
      id: "futsali",
      name: "Futsali",
      handle: "futsali",
      initials: "FU",
      avatarColor: "#2e3e69",
      year: "Year 11",
      bio: "Interested in metaphysics, sport, and whether identity survives change.",
      interests: ["metaphysics", "mind", "logic"]
    },
    {
      id: "mhsthinker",
      name: "MHS Thinker",
      handle: "mhsthinker",
      initials: "MT",
      avatarColor: "#47735f",
      year: "Year 9",
      bio: "Usually arguing about ethics, evidence, and what schools owe students.",
      interests: ["ethics", "politics", "epistemology"]
    },
    {
      id: "platojr",
      name: "Plato Jr",
      handle: "platojr",
      initials: "PJ",
      avatarColor: "#796236",
      year: "Year 10",
      bio: "Collects fallacies and tries to make every argument valid.",
      interests: ["logic", "politics", "religion"]
    },
    {
      id: "socratease",
      name: "Socratease",
      handle: "socratease",
      initials: "SO",
      avatarColor: "#795153",
      year: "Year 12",
      bio: "Asks too many questions, then asks one more.",
      interests: ["ethics", "aesthetics", "mind"]
    },
    {
      id: "artargument",
      name: "Art Argument",
      handle: "artargument",
      initials: "AA",
      avatarColor: "#3f6f8f",
      year: "Year 10",
      bio: "Thinking about beauty, taste, and why some art changes us.",
      interests: ["aesthetics", "religion", "mind"]
    }
  ];

  const posts = [
    {
      id: "post-free-will",
      title: "Can free will exist if every event has a cause?",
      body: "If our choices are caused by earlier events, are we still responsible for them? I think responsibility might depend on whether the action came from our own reasons, not whether it was uncaused.",
      authorId: "futsali",
      topicIds: ["metaphysics", "ethics", "mind"],
      score: 34,
      comments: 18,
      createdAt: "4h ago"
    },
    {
      id: "post-intention-outcome",
      title: "Is intention more important than outcome?",
      body: "A good intention can still cause harm. Should we judge moral action by what someone meant to do, what actually happened, or both?",
      authorId: "socratease",
      topicIds: ["ethics"],
      score: 28,
      comments: 24,
      createdAt: "7h ago"
    },
    {
      id: "post-valid-argument",
      title: "Is this argument valid or just persuasive?",
      body: "If every student who studies improves, and Maya improved, does that prove Maya studied? It sounds convincing, but I think it might affirm the consequent.",
      authorId: "platojr",
      topicIds: ["logic", "epistemology"],
      score: 19,
      comments: 11,
      createdAt: "1d ago"
    },
    {
      id: "post-beauty-shared",
      title: "Is beauty personal or shared?",
      body: "People disagree about music and art, but some patterns seem widely admired. Does that mean beauty is partly subjective and partly social?",
      authorId: "artargument",
      topicIds: ["aesthetics", "mind"],
      score: 22,
      comments: 15,
      createdAt: "1d ago"
    },
    {
      id: "post-knowledge-certainty",
      title: "Do we need certainty to know something?",
      body: "In class we often say we know things that could technically be wrong. Maybe knowledge needs strong enough reasons, not perfect certainty.",
      authorId: "mhsthinker",
      topicIds: ["epistemology", "logic"],
      score: 31,
      comments: 20,
      createdAt: "2d ago"
    },
    {
      id: "post-fair-school-rules",
      title: "What makes a school rule fair?",
      body: "A rule can be clear and still unfair. Should fair rules protect freedom, produce good outcomes, or be agreed to by the people affected?",
      authorId: "mhsthinker",
      topicIds: ["politics", "ethics"],
      score: 25,
      comments: 30,
      createdAt: "2d ago"
    },
    {
      id: "post-conscious-machine",
      title: "Could a machine ever be conscious?",
      body: "If a machine talked and acted like it had inner experience, would that be enough evidence? Or is consciousness something we can never observe directly?",
      authorId: "futsali",
      topicIds: ["mind", "epistemology"],
      score: 27,
      comments: 19,
      createdAt: "3d ago"
    },
    {
      id: "post-god-argument",
      title: "Can an argument prove God exists?",
      body: "Some arguments try to prove God from cause, design, or morality. I want to compare whether they prove too much, too little, or something different.",
      authorId: "platojr",
      topicIds: ["religion", "metaphysics", "logic"],
      score: 17,
      comments: 21,
      createdAt: "3d ago"
    },
    {
      id: "post-art-moral",
      title: "Can bad art still be morally important?",
      body: "If an artwork is ugly, uncomfortable, or technically weak, can it still matter because of the ethical question it raises?",
      authorId: "artargument",
      topicIds: ["aesthetics", "ethics"],
      score: 14,
      comments: 8,
      createdAt: "4d ago"
    },
    {
      id: "post-ship-identity",
      title: "When does a person stop being the same person?",
      body: "If memory, personality, and body all change over time, what actually keeps a person identical to themselves?",
      authorId: "socratease",
      topicIds: ["metaphysics", "mind"],
      score: 33,
      comments: 27,
      createdAt: "4d ago"
    }
  ];

  const messages = [
    { fromId: "futsali", text: "Can you read my argument on identity before Friday?", badge: "New" },
    { fromId: "mhsthinker", text: "I found a counterexample for the ethics discussion.", badge: "2h" },
    { fromId: "platojr", text: "Want to turn the logic thread into a club debate?", badge: "Yesterday" }
  ];

  const conversations = [
    {
      id: "chat-futsali",
      participantIds: ["you", "futsali"],
      unread: true,
      messages: [
        { id: "msg-1", senderId: "futsali", body: "Can you read my argument on identity before Friday?", timestamp: "4:12 PM", read: false },
        { id: "msg-2", senderId: "you", body: "Yes, send it through and I will check the premises first.", timestamp: "4:15 PM", read: true }
      ]
    },
    {
      id: "chat-mhsthinker",
      participantIds: ["you", "mhsthinker"],
      unread: false,
      messages: [
        { id: "msg-3", senderId: "mhsthinker", body: "I found a counterexample for the ethics discussion.", timestamp: "2h", read: true }
      ]
    },
    {
      id: "chat-platojr",
      participantIds: ["you", "platojr"],
      unread: false,
      messages: [
        { id: "msg-4", senderId: "platojr", body: "Want to turn the logic thread into a club debate?", timestamp: "Yesterday", read: true }
      ]
    }
  ];

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

  const signupYears = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Teacher"];

  window.YPG_DATA = {
    currentUserId: "you",
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
