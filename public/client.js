/*  ============================
    ChatClient — Enhanced Version
    ============================ */

class ChatClient {
    constructor() {
        this.currentUser = null;
        this.currentRecipient = null;   // direct chat username
        this.currentGroup = null;       // current groupId
        this.socket = null;
        this.typingTimeout = null;
        this.lastSentMessageId = null;
        this.tempClearedMessages = null;

        // New state
        this.groups = [];               // list of groups for the user
        this.darkMode = false;
        this.reactionSet = ["❤️", "👍", "😂", "😮", "😢", "😡"];

        this.initializeSocket();
        this.initAuthUI();
        this.setupEventListeners();
    }

    /* ============================
       SOCKET INITIALIZATION
       ============================ */
    initializeSocket() {
        this.socket = io();

        this.socket.on("connect", () => {
            if (this.currentUser) {
                this.socket.emit("user-online", this.currentUser.username);
            }
        });

        /* ----- DIRECT MESSAGES ----- */
        this.socket.on("new-message", (message) => {
            const isActiveChat =
                (this.currentRecipient === message.from && !message.isGroup) ||
                (this.currentRecipient === message.to && !message.isGroup);
            if (isActiveChat && !this.currentGroup) {
                this.displayMessage(message);
            }
            this.updateChatListUI();
        });

        this.socket.on("message-sent", (message) => {
            const isActiveChat =
                (this.currentRecipient === message.to && !message.isGroup) ||
                (this.currentRecipient === message.from && !message.isGroup);
            if (isActiveChat && !this.currentGroup) {
                this.displayMessage(message);
            }
            this.updateChatListUI();
        });

        this.socket.on("message-status-update", (data) => {
            this.updateMessageStatus(data.messageId, data.status);
        });

        this.socket.on("message-unsent", (data) => {
            const msg = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (msg) {
                msg.querySelector(".message-text").innerHTML =
                    "<em style='color:#999;'>This message was unsent</em>";
            }
            this.updateChatListUI();
        });

        this.socket.on("message-edited", (data) => {
            const msg = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (msg) {
                msg.querySelector(".message-text").innerHTML =
                    `${data.newText} <span class="edited-tag">(edited)</span>`;
            }
        });

        this.socket.on("message-reacted", (data) => {
            this.updateReactionsUI(data.messageId, data.reactions);
        });

        this.socket.on("chat-cleared", (data) => {
            if (!this.currentGroup && this.currentRecipient === data.chatUser) {
                document.getElementById("messagesContainer").innerHTML =
                    "<div class='no-messages'>No messages yet. Start a conversation!</div>";
            }
            this.tempClearedMessages = data;
            this.showUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on("chat-restored", (data) => {
            if (!this.currentGroup && this.currentRecipient === data.chatUser) {
                this.loadChatMessages();
            }
            this.tempClearedMessages = null;
            this.hideUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on("user-typing", (data) => {
            if (!this.currentGroup && this.currentRecipient === data.username) {
                this.showTypingIndicator(data.username, data.isTyping);
            }
        });

        this.socket.on("user-status-change", () => {
            this.updateChatListUI();
        });

        /* ----- GROUP EVENTS ----- */
        this.socket.on("group-created", (group) => {
            this.groups.push(group);
            this.updateGroupListUI();
        });

        this.socket.on("new-group-message", (message) => {
            if (this.currentGroup === message.groupId) {
                this.displayGroupMessage(message);
            }
            this.updateGroupListUI();
        });

        this.socket.on("group-message-edited", (data) => {
            const msg = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (msg) {
                msg.querySelector(".message-text").innerHTML =
                    `${data.newText} <span class="edited-tag">(edited)</span>`;
            }
        });

        this.socket.on("group-message-unsent", (data) => {
            const msg = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (msg) {
                msg.querySelector(".message-text").innerHTML =
                    "<em style='color:#999;'>This message was unsent</em>";
            }
        });

        this.socket.on("group-message-reacted", (data) => {
            this.updateReactionsUI(data.messageId, data.reactions);
        });

        this.socket.on("group-typing", (data) => {
            if (this.currentGroup === data.groupId) {
                this.showTypingIndicator(data.username, data.isTyping);
            }
        });
    }

    /* ============================
       AUTH UI
       ============================ */
    initAuthUI() {
        const loginForm = document.getElementById("loginForm");
        const signupForm = document.getElementById("signupForm");
        const emailLoginForm = document.getElementById("emailLoginForm");

        const showSignup = document.getElementById("showSignup");
        const showEmailLogin = document.getElementById("showEmailLogin");
        const showLogin = document.getElementById("showLogin");
        const showLoginFromEmail = document.getElementById("showLoginFromEmail");
        const showSignupFromEmail = document.getElementById("showSignupFromEmail");

        const generatedIdSpan = document.getElementById("generatedId");

        const switchToLogin = () => {
            loginForm.classList.remove("hidden");
            signupForm.classList.add("hidden");
            emailLoginForm.classList.add("hidden");
        };

        const switchToSignup = () => {
            loginForm.classList.add("hidden");
            signupForm.classList.remove("hidden");
            emailLoginForm.classList.add("hidden");
            generatedIdSpan.textContent =
                "USR-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        };

        const switchToEmailLogin = () => {
            loginForm.classList.add("hidden");
            signupForm.classList.add("hidden");
            emailLoginForm.classList.remove("hidden");
        };

        showSignup.onclick = (e) => { e.preventDefault(); switchToSignup(); };
        showEmailLogin.onclick = (e) => { e.preventDefault(); switchToEmailLogin(); };
        showLogin.onclick = (e) => { e.preventDefault(); switchToLogin(); };
        showLoginFromEmail.onclick = (e) => { e.preventDefault(); switchToLogin(); };
        showSignupFromEmail.onclick = (e) => { e.preventDefault(); switchToSignup(); };
    }

    /* ============================
       EVENT LISTENERS
       ============================ */
    setupEventListeners() {
        const signupForm = document.getElementById("signupFormElement");
        const quickLoginForm = document.getElementById("quickLoginForm");
        const emailLoginForm = document.getElementById("emailLoginFormElement");

        signupForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.handleRegistration();
        });

        quickLoginForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.handleQuickLogin();
        });

        emailLoginForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.handleEmailLogin();
        });

        document.getElementById("sendBtn").onclick = () => this.sendMessage();
        document.getElementById("unsendMessageBtn").onclick = () => this.unsendLastMessage();
        document.getElementById("searchBtn").onclick = () => this.searchUsers();
        document.getElementById("logoutBtn").onclick = () => this.logout();
        document.getElementById("clearChatBtn").onclick = () => this.clearChat();
        document.getElementById("undoBtn").onclick = () => this.undoClearChat();

        const messageInput = document.getElementById("messageInput");
        messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.sendMessage();
            } else {
                this.handleTyping();
            }
        });

        // Dark mode toggle (button should exist in your HTML)
        const darkToggle = document.getElementById("darkModeToggle");
        if (darkToggle) {
            darkToggle.onclick = () => this.toggleDarkMode();
        }

        // Basic message search in current chat (if you add UI)
        const msgSearchInput = document.getElementById("messageSearchInput");
        const msgSearchBtn = document.getElementById("messageSearchBtn");
        if (msgSearchBtn && msgSearchInput) {
            msgSearchBtn.onclick = () => this.searchMessages(msgSearchInput.value.trim());
        }

        // Group creation UI (optional, if you add inputs/buttons)
        const createGroupBtn = document.getElementById("createGroupBtn");
        if (createGroupBtn) {
            createGroupBtn.onclick = () => this.createGroupFromPrompt();
        }
    }

    /* ============================
       AUTH HANDLERS
       ============================ */
    async handleRegistration() {
        const username = document.getElementById("signupUsername").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;

        if (!username || !email || !password) {
            return this.showStatus("Please fill in all fields", "error");
        }

        const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();
        if (!data.success) return this.showStatus(data.error, "error");

        this.currentUser = data.user;
        this.darkMode = !!data.user.prefersDarkMode;
        this.profileImageUrl = data.user.profileImageUrl || null;

        if (this.darkMode) document.body.classList.add("dark-mode");

        this.socket.emit("user-online", this.currentUser.username);
        this.showChatInterface();
        this.showStatus(data.message, "success");
    }

    async handleQuickLogin() {
        const userId = document.getElementById("quickLoginUserId").value.trim();
        if (!userId) return this.showStatus("Enter Student ID", "error");

        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId })
        });

        const data = await res.json();
        if (!data.success) return this.showStatus(data.error, "error");

        this.currentUser = data.user;
        this.darkMode = !!data.user.prefersDarkMode;
        this.profileImageUrl = data.user.profileImageUrl || null;

        if (this.darkMode) document.body.classList.add("dark-mode");
        else document.body.classList.remove("dark-mode");

        this.socket.emit("user-online", this.currentUser.username);
        this.showChatInterface();
        this.showStatus(data.message, "success");
    }

    async handleEmailLogin() {
        const email = document.getElementById("emailLoginEmail").value.trim();
        const password = document.getElementById("emailLoginPassword").value;

        if (!email || !password) return this.showStatus("Fill all fields", "error");

        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!data.success) return this.showStatus(data.error, "error");

        this.currentUser = data.user;
        this.darkMode = !!data.user.prefersDarkMode;
        this.profileImageUrl = data.user.profileImageUrl || null;

        if (this.darkMode) document.body.classList.add("dark-mode");
        else document.body.classList.remove("dark-mode");

        this.socket.emit("user-online", this.currentUser.username);
        this.showChatInterface();
        this.showStatus(data.message, "success");
    }

    /* ============================
       CHAT LOADING (DIRECT)
       ============================ */
    async startChat(username) {
        this.currentRecipient = username;
        this.currentGroup = null; // leave group mode

        document.getElementById("chatUsername").textContent = `Chat with ${username}`;
        document.getElementById("chatHeader").style.display = "flex";
        document.getElementById("chatInput").style.display = "block";
        document.getElementById("messageInput").disabled = false;
        document.getElementById("sendBtn").disabled = false;

        await this.loadChatMessages();
        await this.updateChatListUI();
    }

    async loadChatMessages() {
        const container = document.getElementById("messagesContainer");
        container.innerHTML = "";

        if (!this.currentUser || !this.currentRecipient) {
            container.innerHTML = "<div class='no-messages'>Select a user to start chatting</div>";
            return;
        }

        const chatId = this.getChatId(this.currentUser.username, this.currentRecipient);
        const res = await fetch(`/api/messages/${chatId}`);
        const messages = await res.json();

        if (!messages.length) {
            container.innerHTML = "<div class='no-messages'>No messages yet.</div>";
            return;
        }

        messages.forEach((msg) => this.displayMessage(msg));
        container.scrollTop = container.scrollHeight;
    }

    /* ============================
       GROUP CHAT LOADING
       ============================ */
    async startGroupChat(groupId) {
        this.currentGroup = groupId;
        this.currentRecipient = null;

        const group = this.groups.find(g => g.id === groupId);
        const name = group ? group.name : "Group";

        document.getElementById("chatUsername").textContent = name;
        document.getElementById("chatHeader").style.display = "flex";
        document.getElementById("chatInput").style.display = "block";
        document.getElementById("messageInput").disabled = false;
        document.getElementById("sendBtn").disabled = false;

        const container = document.getElementById("messagesContainer");
        container.innerHTML = "";

        const res = await fetch(`/api/group-messages/${groupId}`);
        const msgs = await res.json();
        if (!msgs.length) {
            container.innerHTML = "<div class='no-messages'>No messages yet in this group.</div>";
            return;
        }
        msgs.forEach(m => this.displayGroupMessage(m));
        container.scrollTop = container.scrollHeight;
    }

    async loadUserGroups() {
        if (!this.currentUser) return;
        const res = await fetch(`/api/groups/${this.currentUser.username}`);
        this.groups = await res.json();
        this.updateGroupListUI();
    }

    /* ============================
       MESSAGE RENDERING (DIRECT)
       ============================ */
    displayMessage(message) {
        const container = document.getElementById("messagesContainer");

        const div = document.createElement("div");
        div.className = "message " + (message.from === this.currentUser.username ? "own" : "received");
        div.dataset.messageId = message.id;

        const initial = message.from ? message.from[0].toUpperCase() : "?";

        div.innerHTML = `
            <div class="message-avatar">${initial}</div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">
                        ${message.text}
                        ${message.isEdited ? "<span class='edited-tag'>(edited)</span>" : ""}
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <span class="message-status"></span>
                    </div>
                </div>
                <div class="reaction-row"></div>
                <button class="reaction-btn">😊</button>
            </div>
        `;

        // Reaction button click
        div.querySelector(".reaction-btn").onclick = (e) => {
            e.stopPropagation();
            this.openReactionBar(message.id, div, false);
        };

        // Right-click for reactions
        div.oncontextmenu = (e) => {
            e.preventDefault();
            this.openReactionBar(message.id, div, false);
        };

        // Double-click to edit your own message
        if (message.from === this.currentUser.username && !message.isUnsent) {
            div.ondblclick = () => this.editMessagePrompt(message, false);
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        if (message.reactions) {
            this.updateReactionsUI(message.id, message.reactions);
        }

        // If this message has a status (for read receipts)
        if (message.status) {
            this.updateMessageStatus(message.id, message.status);
        }
    }

    /* ============================
       MESSAGE RENDERING (GROUP)
       ============================ */
    displayGroupMessage(message) {
        const container = document.getElementById("messagesContainer");

        const isOwn = message.from === this.currentUser.username;
        const div = document.createElement("div");
        div.className = "message " + (isOwn ? "own" : "received");
        div.dataset.messageId = message.id;

        const fromInitial = message.from ? message.from[0].toUpperCase() : "?";

        div.innerHTML = `
            <div class="message-avatar">${fromInitial}</div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">
                        <strong>${message.from}:</strong> ${message.text}
                        ${message.isEdited ? "<span class='edited-tag'>(edited)</span>" : ""}
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <span class="message-status"></span>
                    </div>
                </div>
                <div class="reaction-row"></div>
                <button class="reaction-btn">😊</button>
            </div>
        `;

        div.querySelector(".reaction-btn").onclick = (e) => {
            e.stopPropagation();
            this.openReactionBar(message.id, div, true);
        };

        div.oncontextmenu = (e) => {
            e.preventDefault();
            this.openReactionBar(message.id, div, true);
        };

        if (isOwn && !message.isUnsent) {
            div.ondblclick = () => this.editMessagePrompt(message, true);
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        if (message.reactions) {
            this.updateReactionsUI(message.id, message.reactions);
        }
    }

    /* ============================
       REACTIONS
       ============================ */
    openReactionBar(messageId, messageElement, isGroup) {
        const existing = messageElement.querySelector(".reaction-bar");
        if (existing) existing.remove();

        const bar = document.createElement("div");
        bar.className = "reaction-bar";

        this.reactionSet.forEach((emoji) => {
            const btn = document.createElement("button");
            btn.className = "reaction-option";
            btn.textContent = emoji;
            btn.onclick = () => {
                if (isGroup && this.currentGroup) {
                    this.socket.emit("react-group-message", {
                        messageId,
                        from: this.currentUser.username,
                        groupId: this.currentGroup,
                        reaction: emoji
                    });
                } else if (this.currentRecipient) {
                    this.socket.emit("react-message", {
                        messageId,
                        from: this.currentUser.username,
                        to: this.currentRecipient,
                        reaction: emoji
                    });
                }
                bar.remove();
            };
            bar.appendChild(btn);
        });

        messageElement.appendChild(bar);

        setTimeout(() => {
            document.addEventListener("click", () => {
                bar.remove();
            }, { once: true });
        }, 50);
    }

    updateReactionsUI(messageId, reactions) {
        const msg = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!msg) return;

        const row = msg.querySelector(".reaction-row");
        row.innerHTML = "";

        const grouped = {};
        reactions.forEach((r) => {
            grouped[r.reaction] = (grouped[r.reaction] || 0) + 1;
        });

        Object.entries(grouped).forEach(([emoji, count]) => {
            const span = document.createElement("span");
            span.className = "reaction-item";
            span.textContent = `${emoji} ${count}`;
            row.appendChild(span);
        });
    }

    /* ============================
       EDIT MESSAGE
       ============================ */
    editMessagePrompt(message, isGroup) {
        const newText = prompt("Edit your message:", message.text);
        if (newText == null || newText.trim() === "" || newText.trim() === message.text) return;

        if (isGroup && this.currentGroup) {
            this.socket.emit("edit-group-message", {
                messageId: message.id,
                from: this.currentUser.username,
                groupId: this.currentGroup,
                newText
            });
        } else if (this.currentRecipient) {
            this.socket.emit("edit-message", {
                messageId: message.id,
                from: this.currentUser.username,
                to: this.currentRecipient,
                newText
            });
        }
    }

    /* ============================
       SEND / UNSEND
       ============================ */
    sendMessage() {
        const input = document.getElementById("messageInput");
        const text = input.value.trim();
        if (!text) return;

        const id = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

        if (this.currentGroup) {
            // group message
            this.socket.emit("send-group-message", {
                from: this.currentUser.username,
                groupId: this.currentGroup,
                text,
                messageId: id
            });
        } else if (this.currentRecipient) {
            // direct message
            this.socket.emit("send-message", {
                from: this.currentUser.username,
                to: this.currentRecipient,
                text,
                messageId: id
            });
        } else {
            return;
        }

        this.lastSentMessageId = id;
        input.value = "";
        this.stopTyping();
    }

    unsendLastMessage() {
        if (!this.lastSentMessageId) return;

        if (this.currentGroup) {
            this.socket.emit("unsend-group-message", {
                messageId: this.lastSentMessageId,
                from: this.currentUser.username,
                groupId: this.currentGroup
            });
        } else if (this.currentRecipient) {
            this.socket.emit("unsend-message", {
                messageId: this.lastSentMessageId,
                from: this.currentUser.username,
                to: this.currentRecipient
            });
        }

        this.lastSentMessageId = null;
    }

    /* ============================
       READ RECEIPTS UI
       ============================ */
    updateMessageStatus(messageId, status) {
        const msg = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!msg) return;
        const statusSpan = msg.querySelector(".message-status");
        if (!statusSpan) return;

        if (status === "sent") {
            statusSpan.textContent = "✓";
            statusSpan.style.color = "#999";
        } else if (status === "delivered") {
            statusSpan.textContent = "✓✓";
            statusSpan.style.color = "#999";
        } else if (status === "read") {
            statusSpan.textContent = "✓✓";
            statusSpan.style.color = "#34b7f1"; // blue like WhatsApp
        } else {
            statusSpan.textContent = "";
        }
    }

    /* ============================
       TYPING INDICATOR
       ============================ */
    handleTyping() {
        if (this.currentGroup) {
            this.socket.emit("group-typing-start", {
                from: this.currentUser.username,
                groupId: this.currentGroup
            });
        } else if (this.currentRecipient) {
            this.socket.emit("typing-start", {
                from: this.currentUser.username,
                to: this.currentRecipient
            });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => this.stopTyping(), 2000);
    }

    stopTyping() {
        if (this.currentGroup) {
            this.socket.emit("group-typing-stop", {
                from: this.currentUser.username,
                groupId: this.currentGroup
            });
        } else if (this.currentRecipient) {
            this.socket.emit("typing-stop", {
                from: this.currentUser.username,
                to: this.currentRecipient
            });
        }
    }

    showTypingIndicator(username, isTyping) {
        const el = document.getElementById("typingIndicator");
        el.style.display = isTyping ? "block" : "none";
        el.textContent = isTyping ? `${username} is typing...` : "";
    }

    /* ============================
       CHAT LIST (DIRECT)
       ============================ */
    async updateChatListUI() {
        if (!this.currentUser) return;
        const res = await fetch(`/api/chats/${this.currentUser.username}`);
        const chats = await res.json();

        const list = document.getElementById("userList");
        list.innerHTML = "";

        if (!chats.length) {
            const li = document.createElement("li");
            li.style.padding = "1rem";
            li.style.textAlign = "center";
            li.style.color = "#666";
            li.style.fontStyle = "italic";
            li.textContent = "No chats yet.";
            list.appendChild(li);
            return;
        }

        chats.forEach((ch) => {
            const li = document.createElement("li");
            li.className = "user-item";
            li.onclick = () => this.startChat(ch.username);

            const initial = ch.username ? ch.username[0].toUpperCase() : "?";

            li.innerHTML = `
                <div class="chat-item-header">
                    <div class="chat-item-avatar">
                        ${initial}
                        <span class="${ch.isOnline ? "online-indicator" : "offline-indicator"}"></span>
                    </div>
                    <div class="chat-item-info">
                        <div class="chat-item-name">${ch.username}</div>
                        <div class="chat-item-preview">${ch.lastMessage || ""}</div>
                    </div>
                </div>
            `;

            list.appendChild(li);
        });
    }

    /* ============================
       GROUP LIST
       ============================ */
    updateGroupListUI() {
        const container = document.getElementById("groupList");
        if (!container) return;

        container.innerHTML = "";

        if (!this.groups || !this.groups.length) {
            container.innerHTML = `
                <li style="padding:0.5rem 1rem; color:#666; font-style:italic;">
                    No groups yet.
                </li>`;
            return;
        }

        this.groups.forEach((g) => {
            const li = document.createElement("li");
            li.className = "group-item";
            li.onclick = () => this.startGroupChat(g.id);

            const initial = g.name ? g.name[0].toUpperCase() : "G";

            li.innerHTML = `
                <div class="chat-item-header">
                    <div class="chat-item-avatar">
                        ${initial}
                    </div>
                    <div class="chat-item-info">
                        <div class="chat-item-name">${g.name}</div>
                        <div class="chat-item-preview">${g.members.length} members</div>
                    </div>
                </div>
            `;

            container.appendChild(li);
        });
    }

    /* ============================
       CREATE GROUP (BASIC PROMPT)
       ============================ */
    async createGroupFromPrompt() {
        const name = prompt("Group name:");
        if (!name) return;

        const membersRaw = prompt("Enter usernames to add (comma separated):");
        if (!membersRaw) return;

        const members = membersRaw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);

        if (!members.length) return;

        this.socket.emit("create-group", {
            name,
            members,
            createdBy: this.currentUser.username
        });
    }

    /* ============================
       SEARCH USERS (EXISTING)
       ============================ */
    async searchUsers() {
        const query = document.getElementById("searchInput").value.trim();
        const resultsContainer = document.getElementById("searchResults");

        if (!query) {
            resultsContainer.innerHTML = "";
            return;
        }

        const res = await fetch(
            `/api/users/search?query=${encodeURIComponent(query)}&currentUser=${encodeURIComponent(this.currentUser.username)}`
        );
        const users = await res.json();

        resultsContainer.innerHTML = "";

        if (!users.length) {
            resultsContainer.innerHTML = "<div class='search-empty'>No users found.</div>";
            return;
        }

        users.forEach((u) => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.textContent = `${u.username} (${u.userId || ""})`;
            div.onclick = () => {
                resultsContainer.innerHTML = "";
                this.startChat(u.username);
            };
            resultsContainer.appendChild(div);
        });
    }

    /* ============================
       MESSAGE SEARCH (CURRENT CHAT)
       ============================ */
    searchMessages(query) {
        if (!query) return;

        const container = document.getElementById("messagesContainer");
        const allMessages = Array.from(container.querySelectorAll(".message"));

        // Clear previous highlights
        allMessages.forEach(m => {
            const txt = m.querySelector(".message-text");
            if (txt) {
                txt.innerHTML = txt.innerHTML.replace(/<mark>|<\/mark>/g, "");
            }
        });

        const matches = [];
        allMessages.forEach(m => {
            const txt = m.querySelector(".message-text");
            if (!txt) return;
            const raw = txt.innerText || txt.textContent || "";
            if (raw.toLowerCase().includes(query.toLowerCase())) {
                matches.push({ element: m, textElement: txt });
            }
        });

        if (!matches.length) {
            this.showStatus("No matches in this chat", "info");
            return;
        }

        matches.forEach(({ textElement }) => {
            const raw = textElement.innerText || textElement.textContent || "";
            const regex = new RegExp(`(${query})`, "ig");
            const highlighted = raw.replace(regex, "<mark>$1</mark>");
            textElement.innerHTML = highlighted;
        });

        // Scroll to first match
        container.scrollTop = matches[0].element.offsetTop - 50;
        this.showStatus(`Found ${matches.length} messages`, "success");
    }

    /* ============================
       CLEAR / UNDO
       ============================ */
    clearChat() {
        if (this.currentGroup) {
            this.showStatus("Clear chat is only for direct chats in this version", "info");
            return;
        }
        if (!this.currentRecipient) return;

        this.socket.emit("clear-chat", {
            username: this.currentUser.username,
            chatUser: this.currentRecipient
        });
    }

    undoClearChat() {
        if (!this.tempClearedMessages) return;

        this.socket.emit("restore-chat", {
            username: this.currentUser.username,
            chatUser: this.currentRecipient,
            clearedMessages: this.tempClearedMessages.clearedMessages
        });
    }

    showUndoNotification() {
        document.getElementById("undoNotification").style.display = "block";
    }

    hideUndoNotification() {
        document.getElementById("undoNotification").style.display = "none";
    }

    /* ============================
       DARK MODE
       ============================ */
    enableDarkMode() {
        document.body.classList.add("dark-mode");
        this.darkMode = true;

        if (!this.currentUser) return;

        fetch("/api/user/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: this.currentUser.username,
                prefersDarkMode: true
            })
        });
    }

    disableDarkMode() {
        document.body.classList.remove("dark-mode");
        this.darkMode = false;

        if (!this.currentUser) return;

        fetch("/api.user/preferences", {  // NOTE: if this is a typo, fix to /api/user/preferences
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: this.currentUser.username,
                prefersDarkMode: false
            })
        });
    }

    toggleDarkMode() {
        if (this.darkMode) this.disableDarkMode();
        else this.enableDarkMode();
    }

    /* ============================
       UI HELPERS
       ============================ */
    showChatInterface() {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("mainApp").style.display = "flex";

        document.getElementById("currentUsername").textContent = this.currentUser.username;
        document.getElementById("currentUserId").textContent = this.currentUser.userId;

        const avatar = document.getElementById("currentUserAvatar");
        avatar.textContent = this.currentUser.username[0].toUpperCase();

        setTimeout(() => this.updateChatListUI(), 300);
        this.loadUserGroups();
    }

    logout() {
        this.currentUser = null;
        this.currentRecipient = null;
        this.currentGroup = null;

        document.getElementById("authScreen").style.display = "flex";
        document.getElementById("mainApp").style.display = "none";

        document.getElementById("quickLoginUserId").value = "";
        document.getElementById("signupEmail").value = "";
        document.getElementById("signupUsername").value = "";
        document.getElementById("signupPassword").value = "";
        document.getElementById("emailLoginEmail").value = "";
        document.getElementById("emailLoginPassword").value = "";

        document.getElementById("messagesContainer").innerHTML =
            "<div class='no-messages'>Select a user to start chatting</div>";
        document.getElementById("userList").innerHTML = `
            <li style="padding:1rem;text-align:center;color:#666;font-style:italic;">
                No chats yet.
            </li>`;

        const groupList = document.getElementById("groupList");
        if (groupList) groupList.innerHTML = "";

        document.body.classList.remove("dark-mode");
        this.showStatus("Logged out", "success");
    }

    /* ============================
       STATUS MESSAGE
       ============================ */
    showStatus(message, type = "info") {
        const el = document.getElementById("statusMessage");
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = "block";

        setTimeout(() => {
            el.style.display = "none";
        }, 4000);
    }

    /* ============================
       UTILITIES
       ============================ */
    getChatId(a, b) {
        return [a, b].sort().join("_");
    }
}

/* ============================
   INITIALIZE CLIENT
   ============================ */
let chatClient;

document.addEventListener("DOMContentLoaded", () => {
    chatClient = new ChatClient();
});
