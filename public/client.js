/* client.js — cleaned, optimized, WhatsApp-style client
   Compatible with the provided index.html and server socket events.
*/

class ChatClient {
    constructor() {
        // State
        this.socket = io();
        this.currentUser = null;
        this.currentRecipient = null;
        this.currentGroup = null;
        this.groups = [];
        this.darkMode = false;
        this.profileImageUrl = null;
        this.lastSentMessageId = null;
        this.typingTimeout = null;
        this.reactionSet = ["👍","❤️","😂","😮","😢","😡"];
        this.tempClearedMessages = null;

        // DOM refs
        this.$ = (id) => document.getElementById(id);
        this.elements = {
            authScreen: this.$("authScreen"),
            mainApp: this.$("mainApp"),
            quickLoginForm: this.$("quickLoginForm"),
            signupFormElement: this.$("signupFormElement"),
            emailLoginFormElement: this.$("emailLoginFormElement"),
            showSignup: this.$("showSignup"),
            showLogin: this.$("showLogin"),
            showEmailLogin: this.$("showEmailLogin"),
            showLoginFromEmail: this.$("showLoginFromEmail"),
            showSignupFromEmail: this.$("showSignupFromEmail"),
            generatedId: this.$("generatedId"),
            searchInput: this.$("searchInput"),
            searchBtn: this.$("searchBtn"),
            searchResults: this.$("searchResults"),
            userList: this.$("userList"),
            groupList: this.$("groupList"),
            messagesContainer: this.$("messagesContainer"),
            chatHeader: this.$("chatHeader"),
            chatUsername: this.$("chatUsername"),
            chatMenuBtn: this.$("chatMenuBtn"),
            chatMenu: this.$("chatMenu"),
            clearChatBtn: this.$("clearChatBtn"),
            typingIndicator: this.$("typingIndicator"),
            messageInput: this.$("messageInput"),
            sendBtn: this.$("sendBtn"),
            unsendMessageBtn: this.$("unsendMessageBtn"),
            undoNotification: this.$("undoNotification"),
            undoBtn: this.$("undoBtn"),
            undoCountdown: this.$("undoCountdown"),
            statusMessage: this.$("statusMessage"),
            currentUserAvatar: this.$("currentUserAvatar"),
            currentUsername: this.$("currentUsername"),
            currentUserId: this.$("currentUserId"),
            logoutBtn: this.$("logoutBtn")
        };

        // Bind UI events
        this.bindUI();

        // Socket events
        this.bindSocket();

        // Small helpers
        this.showStatus("Ready", "info");
    }

    bindUI() {
        // Auth toggles
        if (this.elements.showSignup) this.elements.showSignup.onclick = (e) => { e.preventDefault(); this.toggleAuth("signup"); };
        if (this.elements.showLogin) this.elements.showLogin.onclick = (e) => { e.preventDefault(); this.toggleAuth("login"); };
        if (this.elements.showEmailLogin) this.elements.showEmailLogin.onclick = (e) => { e.preventDefault(); this.toggleAuth("email"); };
        if (this.elements.showLoginFromEmail) this.elements.showLoginFromEmail.onclick = (e) => { e.preventDefault(); this.toggleAuth("login"); };
        if (this.elements.showSignupFromEmail) this.elements.showSignupFromEmail.onclick = (e) => { e.preventDefault(); this.toggleAuth("signup"); };

        // Forms
        if (this.elements.quickLoginForm) {
            this.elements.quickLoginForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleQuickLogin();
            };
        }
        if (this.elements.signupFormElement) {
            this.elements.signupFormElement.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleRegistration();
            };
        }
        if (this.elements.emailLoginFormElement) {
            this.elements.emailLoginFormElement.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleEmailLogin();
            };
        }

        // Search
        if (this.elements.searchBtn) this.elements.searchBtn.onclick = () => this.searchUsers();
        if (this.elements.searchInput) {
            this.elements.searchInput.onkeyup = (e) => {
                if (e.key === "Enter") this.searchUsers();
            };
        }

        // Chat menu
        if (this.elements.chatMenuBtn) {
            this.elements.chatMenuBtn.onclick = (e) => {
                e.stopPropagation();
                this.elements.chatMenu.style.display = this.elements.chatMenu.style.display === "block" ? "none" : "block";
            };
            document.addEventListener("click", () => { if (this.elements.chatMenu) this.elements.chatMenu.style.display = "none"; });
        }
        if (this.elements.clearChatBtn) this.elements.clearChatBtn.onclick = () => this.clearChat();

        // Message input
        if (this.elements.messageInput) {
            this.elements.messageInput.oninput = () => {
                this.elements.sendBtn.disabled = !this.elements.messageInput.value.trim();
                this.handleTyping();
            };
            this.elements.messageInput.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            };
        }
        if (this.elements.sendBtn) this.elements.sendBtn.onclick = () => this.sendMessage();
        if (this.elements.unsendMessageBtn) this.elements.unsendMessageBtn.onclick = () => this.unsendLastMessage();

        // Undo
        if (this.elements.undoBtn) this.elements.undoBtn.onclick = () => {
            this.hideUndoNotification();
            this.undoClearChat();
        };

        // Logout
        if (this.elements.logoutBtn) this.elements.logoutBtn.onclick = () => this.logout();
    }

    bindSocket() {
        // Connection established
        this.socket.on("connect", () => {
            // nothing to do until user logs in
        });

        // Incoming direct message
        this.socket.on("message", (msg) => {
            // If current chat matches, display; otherwise update chat list preview
            if (this.currentRecipient && msg.from === this.currentRecipient && !this.currentGroup) {
                this.displayMessage(msg);
            }
            this.updateChatListUI();
        });

        // Incoming group message
        this.socket.on("group-message", (msg) => {
            if (this.currentGroup && msg.groupId === this.currentGroup) {
                this.displayGroupMessage(msg);
            }
            this.loadUserGroups(); // refresh previews
        });

        // Message status updates (sent/delivered/read)
        this.socket.on("message-status", ({ messageId, status }) => {
            this.updateMessageStatus(messageId, status);
        });

        // Reactions for direct messages
        this.socket.on("message-reactions", ({ messageId, reactions }) => {
            this.updateReactionsUI(messageId, reactions);
        });

        // Reactions for group messages
        this.socket.on("group-message-reactions", ({ messageId, reactions }) => {
            this.updateReactionsUI(messageId, reactions);
        });

        // Chat cleared (server confirms)
        this.socket.on("chat-cleared", ({ username, chatUser, clearedMessages }) => {
            if (!this.currentUser) return;
            if (this.currentUser.username === username && this.currentRecipient === chatUser && !this.currentGroup) {
                this.tempClearedMessages = { clearedMessages };
                this.elements.messagesContainer.innerHTML = "<div class='no-messages'>Chat cleared</div>";
                this.showUndoNotification();
                this.startUndoCountdown();
            }
            this.updateChatListUI();
        });

        // Chat restored
        this.socket.on("chat-restored", ({ username, chatUser, restoredMessages }) => {
            if (!this.currentUser) return;
            if (this.currentUser.username === username && this.currentRecipient === chatUser && !this.currentGroup) {
                this.tempClearedMessages = null;
                this.loadChatMessages();
                this.hideUndoNotification();
            }
            this.updateChatListUI();
        });

        // User presence
        this.socket.on("user-online", (username) => this.updatePresence(username, true));
        this.socket.on("user-offline", (username) => this.updatePresence(username, false));

        // Typing indicators
        this.socket.on("typing", ({ from, to }) => {
            if (this.currentRecipient === from && to === this.currentUser?.username) this.showTypingIndicator(from, true);
            setTimeout(() => this.showTypingIndicator("", false), 2500);
        });
        this.socket.on("group-typing", ({ from, groupId }) => {
            if (this.currentGroup === groupId) this.showTypingIndicator(from, true);
            setTimeout(() => this.showTypingIndicator("", false), 2500);
        });

        // Group created
        this.socket.on("group-created", (group) => {
            this.groups.push(group);
            this.updateGroupListUI();
            this.showStatus(`Group "${group.name}" created`, "success");
        });

        // Generic error
        this.socket.on("error-message", (msg) => this.showStatus(msg, "error"));
    }

    /* ============================
       AUTH HANDLERS
       ============================ */
    async handleRegistration() {
        const username = (this.$("signupUsername") || {}).value?.trim();
        const email = (this.$("signupEmail") || {}).value?.trim();
        const password = (this.$("signupPassword") || {}).value;

        if (!username || !email || !password) {
            return this.showStatus("Please fill in all fields", "error");
        }

        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (!data.success) return this.showStatus(data.error || "Registration failed", "error");

            this.currentUser = data.user;
            this.applyUserPreferences();
            this.socket.emit("user-online", this.currentUser.username);
            this.showChatInterface();
            this.showStatus(data.message || "Registered", "success");
        } catch (err) {
            this.showStatus("Registration error", "error");
            console.error(err);
        }
    }

    async handleQuickLogin() {
        const userId = (this.$("quickLoginUserId") || {}).value?.trim();
        if (!userId) return this.showStatus("Enter Student ID", "error");

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId })
            });
            const data = await res.json();
            if (!data.success) return this.showStatus(data.error || "Login failed", "error");

            this.currentUser = data.user;
            this.applyUserPreferences();
            this.socket.emit("user-online", this.currentUser.username);
            this.showChatInterface();
            this.showStatus(data.message || "Logged in", "success");
        } catch (err) {
            this.showStatus("Login error", "error");
            console.error(err);
        }
    }

    async handleEmailLogin() {
        const email = (this.$("emailLoginEmail") || {}).value?.trim();
        const password = (this.$("emailLoginPassword") || {}).value;
        if (!email || !password) return this.showStatus("Fill all fields", "error");

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!data.success) return this.showStatus(data.error || "Login failed", "error");

            this.currentUser = data.user;
            this.applyUserPreferences();
            this.socket.emit("user-online", this.currentUser.username);
            this.showChatInterface();
            this.showStatus(data.message || "Logged in", "success");
        } catch (err) {
            this.showStatus("Login error", "error");
            console.error(err);
        }
    }

    applyUserPreferences() {
        this.darkMode = !!this.currentUser?.prefersDarkMode;
        if (this.darkMode) document.body.classList.add("dark-mode");
        else document.body.classList.remove("dark-mode");
        this.profileImageUrl = this.currentUser?.profileImageUrl || null;
    }

    /* ============================
       CHAT LOADING (DIRECT)
       ============================ */
    async startChat(username) {
        this.currentRecipient = username;
        this.currentGroup = null;
        this.elements.chatUsername.textContent = `Chat with ${username}`;
        this.elements.chatHeader.style.display = "flex";
        this.elements.chatInput.style.display = "block";
        this.elements.messageInput.disabled = false;
        this.elements.sendBtn.disabled = false;
        await this.loadChatMessages();
        await this.updateChatListUI();
    }

    async loadChatMessages() {
        const container = this.elements.messagesContainer;
        container.innerHTML = "";

        if (!this.currentUser || !this.currentRecipient) {
            container.innerHTML = "<div class='no-messages'>Select a user to start chatting</div>";
            return;
        }

        const chatId = this.getChatId(this.currentUser.username, this.currentRecipient);
        try {
            const res = await fetch(`/api/messages/${encodeURIComponent(chatId)}`);
            const messages = await res.json();
            if (!messages || !messages.length) {
                container.innerHTML = "<div class='no-messages'>No messages yet.</div>";
                return;
            }
            messages.forEach((msg) => this.displayMessage(msg));
            container.scrollTop = container.scrollHeight;
        } catch (err) {
            console.error(err);
            container.innerHTML = "<div class='no-messages'>Unable to load messages.</div>";
        }
    }

    /* ============================
       GROUP CHAT LOADING
       ============================ */
    async startGroupChat(groupId) {
        this.currentGroup = groupId;
        this.currentRecipient = null;

        const group = this.groups.find(g => g.id === groupId);
        const name = group ? group.name : "Group";

        this.elements.chatUsername.textContent = name;
        this.elements.chatHeader.style.display = "flex";
        this.elements.chatInput.style.display = "block";
        this.elements.messageInput.disabled = false;
        this.elements.sendBtn.disabled = false;

        const container = this.elements.messagesContainer;
        container.innerHTML = "";

        try {
            const res = await fetch(`/api/group-messages/${encodeURIComponent(groupId)}`);
            const msgs = await res.json();
            if (!msgs || !msgs.length) {
                container.innerHTML = "<div class='no-messages'>No messages yet in this group.</div>";
                return;
            }
            msgs.forEach(m => this.displayGroupMessage(m));
            container.scrollTop = container.scrollHeight;
        } catch (err) {
            console.error(err);
            container.innerHTML = "<div class='no-messages'>Unable to load group messages.</div>";
        }
    }

    async loadUserGroups() {
        if (!this.currentUser) return;
        try {
            const res = await fetch(`/api/groups/${encodeURIComponent(this.currentUser.username)}`);
            const groups = await res.json();
            this.groups = Array.isArray(groups) ? groups : [];
            this.updateGroupListUI();
        } catch (err) {
            console.error(err);
        }
    }

    /* ============================
       MESSAGE RENDERING (DIRECT)
       ============================ */
    displayMessage(message) {
        const container = this.elements.messagesContainer;
        if (!container) return;

        // Build message element
        const div = document.createElement("div");
        div.className = "message " + (message.from === this.currentUser.username ? "own" : "received");
        div.dataset.messageId = message.id;

        const initial = message.from ? message.from[0].toUpperCase() : "?";

        div.innerHTML = `
            <div class="message-avatar">${initial}</div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">
                        ${this.escapeHtml(message.text || "")}
                        ${message.isEdited ? "<span class='edited-tag'>(edited)</span>" : ""}
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <span class="message-status"></span>
                    </div>
                </div>
                <div class="reaction-row"></div>
                <button class="reaction-btn" title="React">😊</button>
            </div>
        `;

        // Reaction button
        const reactionBtn = div.querySelector(".reaction-btn");
        reactionBtn.onclick = (e) => {
            e.stopPropagation();
            this.openReactionBar(message.id, div, false);
        };

        // Context menu (right click)
        div.oncontextmenu = (e) => {
            e.preventDefault();
            this.openReactionBar(message.id, div, false);
        };

        // Double-click to edit own message
        if (message.from === this.currentUser.username && !message.isUnsent) {
            div.ondblclick = () => this.editMessagePrompt(message, false);
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        if (message.reactions) this.updateReactionsUI(message.id, message.reactions);
        if (message.status) this.updateMessageStatus(message.id, message.status);
    }

    /* ============================
       MESSAGE RENDERING (GROUP)
       ============================ */
    displayGroupMessage(message) {
        const container = this.elements.messagesContainer;
        if (!container) return;

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
                        <strong>${this.escapeHtml(message.from)}:</strong> ${this.escapeHtml(message.text || "")}
                        ${message.isEdited ? "<span class='edited-tag'>(edited)</span>" : ""}
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <span class="message-status"></span>
                    </div>
                </div>
                <div class="reaction-row"></div>
                <button class="reaction-btn" title="React">😊</button>
            </div>
        `;

        const reactionBtn = div.querySelector(".reaction-btn");
        reactionBtn.onclick = (e) => {
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

        if (message.reactions) this.updateReactionsUI(message.id, message.reactions);
    }

    /* ============================
       REACTIONS
       ============================ */
    openReactionBar(messageId, messageElement, isGroup) {
        // Remove existing
        const existing = messageElement.querySelector(".reaction-bar");
        if (existing) existing.remove();

        const bar = document.createElement("div");
        bar.className = "reaction-bar";

        this.reactionSet.forEach((emoji) => {
            const btn = document.createElement("button");
            btn.className = "reaction-option";
            btn.textContent = emoji;
            btn.onclick = (e) => {
                e.stopPropagation();
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

        // Close on outside click
        setTimeout(() => {
            const onDocClick = (ev) => {
                if (!bar.contains(ev.target)) bar.remove();
                document.removeEventListener("click", onDocClick);
            };
            document.addEventListener("click", onDocClick);
        }, 50);
    }

    updateReactionsUI(messageId, reactions) {
        const msg = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!msg) return;
        const row = msg.querySelector(".reaction-row");
        if (!row) return;
        row.innerHTML = "";

        const grouped = {};
        (reactions || []).forEach((r) => {
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
        if (newText == null) return;
        const trimmed = newText.trim();
        if (trimmed === "" || trimmed === message.text) return;

        if (isGroup && this.currentGroup) {
            this.socket.emit("edit-group-message", {
                messageId: message.id,
                from: this.currentUser.username,
                groupId: this.currentGroup,
                newText: trimmed
            });
        } else if (this.currentRecipient) {
            this.socket.emit("edit-message", {
                messageId: message.id,
                from: this.currentUser.username,
                to: this.currentRecipient,
                newText: trimmed
            });
        }
    }

    /* ============================
       SEND / UNSEND
       ============================ */
    sendMessage() {
        const input = this.elements.messageInput;
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const id = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

        if (this.currentGroup) {
            this.socket.emit("send-group-message", {
                from: this.currentUser.username,
                groupId: this.currentGroup,
                text,
                messageId: id,
                timestamp: Date.now()
            });
        } else if (this.currentRecipient) {
            this.socket.emit("send-message", {
                from: this.currentUser.username,
                to: this.currentRecipient,
                text,
                messageId: id,
                timestamp: Date.now()
            });
        } else {
            return;
        }

        this.lastSentMessageId = id;
        input.value = "";
        this.elements.sendBtn.disabled = true;
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
            statusSpan.style.color = "var(--wa-status-blue)";
        } else {
            statusSpan.textContent = "";
        }
    }

    /* ============================
       TYPING INDICATOR
       ============================ */
    handleTyping() {
        if (!this.currentUser) return;
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
        if (!this.currentUser) return;
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
        const el = this.elements.typingIndicator;
        if (!el) return;
        el.style.display = isTyping ? "block" : "none";
        el.textContent = isTyping ? `${username} is typing...` : "";
    }

    /* ============================
       CHAT LIST (DIRECT)
       ============================ */
    async updateChatListUI() {
        if (!this.currentUser) return;
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(this.currentUser.username)}`);
            const chats = await res.json();
            const list = this.elements.userList;
            list.innerHTML = "";

            if (!chats || !chats.length) {
                const li = document.createElement("li");
                li.style.padding = "1rem";
                li.style.textAlign = "center";
                li.style.color = "#8696a0";
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
                            <div class="chat-item-name">${this.escapeHtml(ch.username)}</div>
                            <div class="chat-item-preview">${this.escapeHtml(ch.lastMessage || "")}</div>
                        </div>
                    </div>
                `;
                list.appendChild(li);
            });
        } catch (err) {
            console.error(err);
        }
    }

    /* ============================
       GROUP LIST
       ============================ */
    updateGroupListUI() {
        const container = this.elements.groupList;
        if (!container) return;
        container.innerHTML = "";

        if (!this.groups || !this.groups.length) {
            container.innerHTML = `
                <li style="padding:0.8rem 0.9rem; color:#8696a0; font-style:italic;">
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
                        <div class="chat-item-name">${this.escapeHtml(g.name)}</div>
                        <div class="chat-item-preview">${g.members?.length || 0} members</div>
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
        if (!this.currentUser) return;
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
        const query = (this.elements.searchInput || {}).value?.trim();
        const resultsContainer = this.elements.searchResults;
        if (!resultsContainer) return;

        if (!query) {
            resultsContainer.innerHTML = "";
            return;
        }

        try {
            const res = await fetch(
                `/api/users/search?query=${encodeURIComponent(query)}&currentUser=${encodeURIComponent(this.currentUser?.username || "")}`
            );
            const users = await res.json();
            resultsContainer.innerHTML = "";

            if (!users || !users.length) {
                resultsContainer.innerHTML = "<div class='search-empty' style='padding:0.6rem;color:#8696a0;'>No users found.</div>";
                return;
            }

            users.forEach((u) => {
                const div = document.createElement("div");
                div.className = "search-result-item";
                div.innerHTML = `<div>${this.escapeHtml(u.username)} <span style="color:#999;font-size:0.8rem">(${this.escapeHtml(u.userId || "")})</span></div>`;
                div.onclick = () => {
                    resultsContainer.innerHTML = "";
                    this.startChat(u.username);
                };
                resultsContainer.appendChild(div);
            });
        } catch (err) {
            console.error(err);
        }
    }

    /* ============================
       MESSAGE SEARCH (CURRENT CHAT)
       ============================ */
    searchMessages(query) {
        if (!query) return;
        const container = this.elements.messagesContainer;
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
            const regex = new RegExp(`(${this.escapeRegExp(query)})`, "ig");
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
        if (!this.elements.undoNotification) return;
        this.elements.undoNotification.style.display = "block";
    }

    hideUndoNotification() {
        if (!this.elements.undoNotification) return;
        this.elements.undoNotification.style.display = "none";
    }

    startUndoCountdown() {
        let count = 5;
        if (!this.elements.undoCountdown) return;
        this.elements.undoCountdown.textContent = count;
        const interval = setInterval(() => {
            count -= 1;
            this.elements.undoCountdown.textContent = count;
            if (count <= 0) {
                clearInterval(interval);
                this.hideUndoNotification();
                this.tempClearedMessages = null;
            }
        }, 1000);
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
        }).catch(() => {});
    }

    disableDarkMode() {
        document.body.classList.remove("dark-mode");
        this.darkMode = false;
        if (!this.currentUser) return;
        fetch("/api/user/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: this.currentUser.username,
                prefersDarkMode: false
            })
        }).catch(() => {});
    }

    toggleDarkMode() {
        if (this.darkMode) this.disableDarkMode();
        else this.enableDarkMode();
    }

    /* ============================
       UI HELPERS
       ============================ */
    showChatInterface() {
        if (this.elements.authScreen) this.elements.authScreen.style.display = "none";
        if (this.elements.mainApp) this.elements.mainApp.style.display = "block";

        if (this.elements.currentUsername) this.elements.currentUsername.textContent = this.currentUser.username;
        if (this.elements.currentUserId) this.elements.currentUserId.textContent = this.currentUser.userId || "";

        if (this.elements.currentUserAvatar) {
            this.elements.currentUserAvatar.textContent = (this.currentUser.username || "U")[0].toUpperCase();
        }

        setTimeout(() => this.updateChatListUI(), 300);
        this.loadUserGroups();
    }

    logout() {
        this.currentUser = null;
        this.currentRecipient = null;
        this.currentGroup = null;

        if (this.elements.authScreen) this.elements.authScreen.style.display = "flex";
        if (this.elements.mainApp) this.elements.mainApp.style.display = "none";

        // Clear inputs
        ["quickLoginUserId","signupEmail","signupUsername","signupPassword","emailLoginEmail","emailLoginPassword"].forEach(id => {
            const el = this.$(id);
            if (el) el.value = "";
        });

        if (this.elements.messagesContainer) this.elements.messagesContainer.innerHTML =
            "<div class='no-messages'>Select a user to start chatting</div>";
        if (this.elements.userList) this.elements.userList.innerHTML = `
            <li style="padding:1rem;text-align:center;color:#8696a0;font-style:italic;">
                No chats yet.
            </li>`;

        if (this.elements.groupList) this.elements.groupList.innerHTML = "";
        document.body.classList.remove("dark-mode");
        this.showStatus("Logged out", "success");
        this.socket.emit("user-offline", "anonymous");
    }

    /* ============================
       STATUS MESSAGE
       ============================ */
    showStatus(message, type = "info") {
        const el = this.elements.statusMessage;
        if (!el) return;
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = "block";
        setTimeout(() => { el.style.display = "none"; }, 3500);
    }

    /* ============================
       UTILITIES
       ============================ */
    getChatId(a, b) {
        return [a, b].sort().join("_");
    }

    escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}

/* Initialize */
let chatClient;
document.addEventListener("DOMContentLoaded", () => {
    chatClient = new ChatClient();
});
