/* ============================================================
   REAL-TIME CHAT CLIENT (FIXED VERSION)
   ============================================================ */

class ChatClient {
    constructor() {
        this.currentUser = null;
        this.currentRecipient = null;
        this.socket = null;
        this.typingTimeout = null;
        this.lastSentMessageId = null;
        this.tempClearedMessages = null;

        this.initializeSocket();
        this.setupEventListeners();
    }

    /* ============================================================
       SOCKET.IO INITIALIZATION
       ============================================================ */
    initializeSocket() {
        this.socket = io();

        this.socket.on("connect", () => {
            console.log("🔗 Connected to server");
            if (this.currentUser) {
                this.socket.emit("user-online", this.currentUser.username);
            }
        });

        this.socket.on("disconnect", () => {
            console.log("❌ Disconnected from server");
        });

        this.socket.on("new-message", (message) => {
            this.displayMessage(message);
            this.updateChatListUI();
        });

        this.socket.on("message-sent", (message) => {
            this.displayMessage(message);
            this.updateChatListUI();
        });

        this.socket.on("message-status-update", (data) => {
            this.updateMessageStatus(data.messageId, data.status);
        });

        this.socket.on("message-unsent", (data) => {
            const msg = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (msg) {
                const text = msg.querySelector(".message-text");
                if (text) {
                    text.innerHTML = `<em style="color:#999;">This message was unsent</em>`;
                }
            }
            this.updateChatListUI();
        });

        this.socket.on("chat-cleared", (data) => {
            this.tempClearedMessages = data;

            const container = document.getElementById("messagesContainer");
            container.innerHTML = `<div class="no-messages">No messages yet. Start a conversation!</div>`;

            this.showUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on("chat-restored", (data) => {
            if (this.currentRecipient === data.chatUser) {
                this.loadChatMessages();
            }
            this.tempClearedMessages = null;
            this.hideUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on("typing-start", (data) => {
            this.showTypingIndicator(data.from, true);
        });

        this.socket.on("typing-stop", (data) => {
            this.showTypingIndicator(data.from, false);
        });

        this.socket.on("user-status-change", () => {
            this.updateChatListUI();
        });
    }

    /* ============================================================
       EVENT LISTENERS
       ============================================================ */
    setupEventListeners() {
        console.log("🔧 Setting up event listeners...");

        const signupForm = document.getElementById("signupFormElement");
        const quickLoginForm = document.getElementById("quickLoginForm");
        const emailLoginForm = document.getElementById("emailLoginFormElement");

        if (signupForm) signupForm.addEventListener("submit", (e) => { e.preventDefault(); this.handleRegistration(); });
        if (quickLoginForm) quickLoginForm.addEventListener("submit", (e) => { e.preventDefault(); this.handleQuickLogin(); });
        if (emailLoginForm) emailLoginForm.addEventListener("submit", (e) => { e.preventDefault(); this.handleEmailLogin(); });

        const sendBtn = document.getElementById("sendBtn");
        const unsendMessageBtn = document.getElementById("unsendMessageBtn");
        const messageInput = document.getElementById("messageInput");
        const searchBtn = document.getElementById("searchBtn");
        const logoutBtn = document.getElementById("logoutBtn");
        const chatMenuBtn = document.getElementById("chatMenuBtn");
        const clearChatBtn = document.getElementById("clearChatBtn");

        if (sendBtn) sendBtn.onclick = () => this.sendMessage();
        if (unsendMessageBtn) unsendMessageBtn.onclick = () => this.unsendLastMessage();
        if (chatMenuBtn) chatMenuBtn.onclick = (e) => { e.stopPropagation(); this.toggleChatMenu(); };
        if (clearChatBtn) clearChatBtn.onclick = () => { this.clearChat(); this.hideChatMenu(); };
        if (searchBtn) searchBtn.onclick = () => this.searchUsers();
        if (logoutBtn) logoutBtn.onclick = () => this.logout();

        document.addEventListener("click", () => this.hideChatMenu());

        if (messageInput) {
            messageInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    this.sendMessage();
                } else {
                    this.handleTyping();
                }
            });
        }

        const studentIdInput = document.getElementById("quickLoginUserId");
        if (studentIdInput) this.setupStudentIdFormatting(studentIdInput);

        const searchInput = document.getElementById("searchInput");
        if (searchInput) {
            this.setupStudentIdFormatting(searchInput);
            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") this.searchUsers();
            });
        }
    }

    /* ============================================================
       LOGIN / SIGNUP
       ============================================================ */
    async handleRegistration() {
        const username = document.getElementById("signupUsername").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;

        if (!username || !email || !password) {
            this.showStatus("Please fill in all fields", "error");
            return;
        }

        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this; // ⭐ FIX
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, "success");
            } else {
                this.showStatus(data.error, "error");
            }
        } catch {
            this.showStatus("Registration failed. Please try again.", "error");
        }
    }

    async handleQuickLogin() {
        const userId = document.getElementById("quickLoginUserId").value.trim();

        if (!userId) {
            this.showStatus("Please enter your Student ID", "error");
            return;
        }

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this; // ⭐ FIX
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, "success");
            } else {
                this.showStatus(data.error, "error");
            }
        } catch {
            this.showStatus("Login failed. Please try again.", "error");
        }
    }

    async handleEmailLogin() {
        const email = document.getElementById("emailLoginEmail").value.trim();
        const password = document.getElementById("emailLoginPassword").value;

        if (!email || !password) {
            this.showStatus("Please fill in all fields", "error");
            return;
        }

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this; // ⭐ FIX
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, "success");
            } else {
                this.showStatus(data.error, "error");
            }
        } catch {
            this.showStatus("Login failed. Please try again.", "error");
        }
    }

    /* ============================================================
       START CHAT
       ============================================================ */
    async startChat(username) {
        if (!this.currentUser) {
            console.error("❌ currentUser is NULL before starting chat");
            this.showStatus("You must log in before starting a chat", "error");
            return;
        }

        this.currentRecipient = username;

        // Create chat entry
        await fetch(`/api/messages/${this.getChatId(this.currentUser.username, username)}`);

        this.hideUnsendButton();

        const chatHeader = document.getElementById("chatHeader");
        const chatUsername = document.getElementById("chatUsername");
        if (chatHeader && chatUsername) {
            chatUsername.textContent = `Chat with ${username}`;
            chatHeader.style.display = "flex";
        }

        const chatInput = document.getElementById("chatInput");
        const messageInput = document.getElementById("messageInput");
        const sendBtn = document.getElementById("sendBtn");

        if (chatInput) chatInput.style.display = "block";
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.focus();
        }
        if (sendBtn) sendBtn.disabled = false;

        const searchResults = document.getElementById("searchResults");
        if (searchResults) searchResults.innerHTML = "";

        await this.loadChatMessages();
        await this.updateChatListUI();

        this.showStatus(`Started chat with ${username}`, "success");
    }

    /* ============================================================
       LOAD MESSAGES
       ============================================================ */
    async loadChatMessages() {
        if (!this.currentRecipient) return;

        const container = document.getElementById("messagesContainer");
        container.innerHTML = "";

        const chatId = this.getChatId(this.currentUser.username, this.currentRecipient);

        try {
            const response = await fetch(`/api/messages/${chatId}`);
            const data = await response.json();

            const messages = data.messages || data;

            if (messages.length === 0) {
                container.innerHTML = `<div class="no-messages">No messages yet. Start a conversation!</div>`;
                return;
            }

            messages.forEach((msg) => this.displayMessage(msg));
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error("Error loading messages:", error);
        }
    }

    /* ============================================================
       DISPLAY MESSAGE
       ============================================================ */
    displayMessage(msg) {
        const container = document.getElementById("messagesContainer");

        const div = document.createElement("div");
        div.className = `message ${msg.from === this.currentUser.username ? "own" : "received"}`;
        div.dataset.messageId = msg.messageId;

        div.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">${msg.text}</div>
                    <div class="message-meta">
                        <span class="message-time">${msg.time || ""}</span>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    /* ============================================================
       SEND MESSAGE
       ============================================================ */
    sendMessage() {
        const input = document.getElementById("messageInput");
        const text = input.value.trim();

        if (!text || !this.currentRecipient) {
            this.showStatus("Please enter a message and select a recipient", "error");
            return;
        }

        const messageId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

        this.socket.emit("send-message", {
            from: this.currentUser.username,
            to: this.currentRecipient,
            text,
            messageId,
        });

        this.lastSentMessageId = messageId;
        this.showUnsendButton();

        input.value = "";
        this.stopTyping();
    }

    /* ============================================================
       SEARCH USERS
       ============================================================ */
    async searchUsers() {
        const searchInput = document.getElementById("searchInput");
        const query = searchInput.value.trim();

        if (!query) {
            this.showStatus("Please enter a search term", "error");
            return;
        }

        try {
            const response = await fetch(
                `/api/users/search?query=${encodeURIComponent(query)}&currentUser=${encodeURIComponent(this.currentUser.username)}`
            );
            const results = await response.json();
            this.displaySearchResults(results);
        } catch {
            this.showStatus("Search failed. Please try again.", "error");
        }
    }

    displaySearchResults(results) {
        const container = document.getElementById("searchResults");
        container.innerHTML = "";

        if (results.length === 0) {
            container.innerHTML = `<div style="padding:1rem;text-align:center;color:#666;">No users found</div>`;
            return;
        }

        results.forEach((user) => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerHTML = `
                <div>
                    <div style="font-weight:bold;">${user.username}</div>
                    <div style="font-size:0.8rem;color:#666;">Student ID: ${user.userId}</div>
                </div>
                <button class="add-user-btn" onclick="chatClient.startChat('${user.username}')">Chat</button>
            `;
            container.appendChild(div);
        });
    }

    /* ============================================================
       TYPING INDICATOR
       ============================================================ */
    handleTyping() {
        if (!this.currentRecipient) return;

        this.socket.emit("typing-start", {
            from: this.currentUser.username,
            to: this.currentRecipient,
        });

        clearTimeout(this.typingTimeout);

        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 3000);
    }

    stopTyping() {
        if (!this.currentRecipient) return;

        this.socket.emit("typing-stop", {
            from: this.currentUser.username,
            to: this.currentRecipient,
        });
    }

    showTypingIndicator(username, isTyping) {
        const indicator = document.getElementById("typingIndicator");
        if (isTyping) {
            indicator.innerHTML = `${username} is typing...`;
            indicator.style.display = "block";
        } else {
            indicator.style.display = "none";
        }
    }

    /* ============================================================
       CHAT LIST
       ============================================================ */
    async updateChatListUI() {
        if (!this.currentUser) return;

        try {
            const res = await fetch(`/api/chatlist/${this.currentUser.username}`);
            const data = await res.json();

            const chats = data.chats || data;
            const list = document.getElementById("userList");
            list.innerHTML = "";

            chats.forEach((chat) => {
                const li = document.createElement("li");
                li.className = "user-item";
                li.onclick = () => this.startChat(chat.username);

                li.innerHTML = `
                    <div class="chat-item-header">
                        <div class="chat-item-avatar">${chat.username[0]}</div>
                        <div class="chat-item-info">
                            <div class="chat-item-name">${chat.username}</div>
                            <div class="chat-item-preview">${chat.lastMessage || ""}</div>
                        </div>
                    </div>
                `;

                list.appendChild(li);
            });
        } catch (err) {
            console.error("Chat list update failed:", err);
        }
    }

    /* ============================================================
       CLEAR CHAT / UNDO
       ============================================================ */
    clearChat() {
        this.socket.emit("clear-chat", {
            user: this.currentUser.username,
            chatUser: this.currentRecipient,
        });
    }

    undoClearChat() {
        this.socket.emit("undo-clear-chat", {
            user: this.currentUser.username,
            chatUser: this.currentRecipient,
        });
    }

    showUndoNotification() {
        document.getElementById("undoNotification").style.display = "block";
    }

    hideUndoNotification() {
        document.getElementById("undoNotification").style.display = "none";
    }

    /* ============================================================
       UI HELPERS
       ============================================================ */
    showChatInterface() {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("mainApp").style.display = "flex";

        document.getElementById("currentUsername").textContent = this.currentUser.username;
        document.getElementById("currentUserId").textContent = this.currentUser.userId;
        document.getElementById("currentUserAvatar").textContent = this.currentUser.username[0].toUpperCase();

        setTimeout(() => this.updateChatListUI(), 300);
    }

    logout() {
        this.currentUser = null;
        this.currentRecipient = null;

        document.getElementById("authScreen").style.display = "flex";
        document.getElementById("mainApp").style.display = "none";

        document.getElementById("quickLoginUserId").value = "";
        document.getElementById("signupEmail").value = "";
        document.getElementById("signupUsername").value = "";
        document.getElementById("signupPassword").value = "";
        document.getElementById("emailLoginEmail").value = "";
        document.getElementById("emailLoginPassword").value = "";

        this.showStatus("Logged out successfully", "success");
    }

    showStatus(message, type = "info") {
        console.log(`📢 Status (${type}):`, message);

        const el = document.getElementById("statusMessage");
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = "block";

        setTimeout(() => {
            el.style.display = "none";
        }, 5000);
    }

    getChatId(a, b) {
        return [a, b].sort().join("_");
    }
