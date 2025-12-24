class ChatClient {
    constructor() {
        this.currentUser = null;
        this.currentRecipient = null;
        this.socket = null;
        this.typingTimeout = null;
        this.lastSentMessageId = null;
        this.tempClearedMessages = null;

        this.initializeSocket();
        this.initAuthUI();
        this.setupEventListeners();
    }

    initializeSocket() {
        this.socket = io();

        this.socket.on("connect", () => {
            if (this.currentUser) {
                this.socket.emit("user-online", this.currentUser.username);
            }
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
            const messageElement = document.querySelector(
                `[data-message-id="${data.messageId}"]`
            );
            if (messageElement) {
                const textElement =
                    messageElement.querySelector(".message-text");
                if (textElement) {
                    textElement.innerHTML =
                        "<em style='color:#999;'>This message was unsent</em>";
                }
            }
            this.updateChatListUI();
        });

        this.socket.on("chat-cleared", (data) => {
            this.tempClearedMessages = data;
            const container = document.getElementById("messagesContainer");
            container.innerHTML =
                "<div class='no-messages'>No messages yet. Start a conversation!</div>";
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

        this.socket.on("user-typing", (data) => {
            this.showTypingIndicator(data.username, data.isTyping);
        });

        this.socket.on("user-status-change", () => {
            this.updateChatListUI();
        });
    }

    initAuthUI() {
        const loginForm = document.getElementById("loginForm");
        const signupForm = document.getElementById("signupForm");
        const emailLoginForm = document.getElementById("emailLoginForm");

        const showSignup = document.getElementById("showSignup");
        const showEmailLogin = document.getElementById("showEmailLogin");
        const showLogin = document.getElementById("showLogin");
        const showLoginFromEmail =
            document.getElementById("showLoginFromEmail");
        const showSignupFromEmail =
            document.getElementById("showSignupFromEmail");

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
            if (generatedIdSpan) {
                const newId =
                    "USR-" +
                    Math.random().toString(36).substr(2, 5).toUpperCase();
                generatedIdSpan.textContent = newId;
            }
        };

        const switchToEmailLogin = () => {
            loginForm.classList.add("hidden");
            signupForm.classList.add("hidden");
            emailLoginForm.classList.remove("hidden");
        };

        if (showSignup) {
            showSignup.addEventListener("click", (e) => {
                e.preventDefault();
                switchToSignup();
            });
        }

        if (showEmailLogin) {
            showEmailLogin.addEventListener("click", (e) => {
                e.preventDefault();
                switchToEmailLogin();
            });
        }

        if (showLogin) {
            showLogin.addEventListener("click", (e) => {
                e.preventDefault();
                switchToLogin();
            });
        }

        if (showLoginFromEmail) {
            showLoginFromEmail.addEventListener("click", (e) => {
                e.preventDefault();
                switchToLogin();
            });
        }

        if (showSignupFromEmail) {
            showSignupFromEmail.addEventListener("click", (e) => {
                e.preventDefault();
                switchToSignup();
            });
        }
    }

    setupEventListeners() {
        const signupForm = document.getElementById("signupFormElement");
        const quickLoginForm = document.getElementById("quickLoginForm");
        const emailLoginForm = document.getElementById(
            "emailLoginFormElement"
        );

        if (signupForm) {
            signupForm.addEventListener("submit", (e) => {
                e.preventDefault();
                this.handleRegistration();
            });
        }

        if (quickLoginForm) {
            quickLoginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                this.handleQuickLogin();
            });
        }

        if (emailLoginForm) {
            emailLoginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                this.handleEmailLogin();
            });
        }

        const sendBtn = document.getElementById("sendBtn");
        const unsendBtn = document.getElementById("unsendMessageBtn");
        const messageInput = document.getElementById("messageInput");
        const searchBtn = document.getElementById("searchBtn");
        const logoutBtn = document.getElementById("logoutBtn");
        const chatMenuBtn = document.getElementById("chatMenuBtn");
        const clearChatBtn = document.getElementById("clearChatBtn");
        const undoBtn = document.getElementById("undoBtn");

        if (sendBtn) {
            sendBtn.addEventListener("click", () => this.sendMessage());
        }

        if (unsendBtn) {
            unsendBtn.addEventListener("click", () => this.unsendLastMessage());
        }

        if (chatMenuBtn) {
            chatMenuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleChatMenu();
            });
        }

        if (clearChatBtn) {
            clearChatBtn.addEventListener("click", () => {
                this.clearChat();
                this.hideChatMenu();
            });
        }

        if (undoBtn) {
            undoBtn.addEventListener("click", () => {
                this.undoClearChat();
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener("click", () => this.searchUsers());
        }

        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => this.logout());
        }

        document.addEventListener("click", () => this.hideChatMenu());

        if (messageInput) {
            messageInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.sendMessage();
                } else {
                    this.handleTyping();
                }
            });
        }

        const studentIdInput = document.getElementById("quickLoginUserId");
        if (studentIdInput) {
            this.setupStudentIdFormatting(studentIdInput);
        }

        const searchInput = document.getElementById("searchInput");
        if (searchInput) {
            this.setupStudentIdFormatting(searchInput);
            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.searchUsers();
                }
            });
        }
    }

    setupStudentIdFormatting(input) {
        input.addEventListener("input", () => {
            let v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (!v.startsWith("USR")) {
                v = "USR" + v.replace(/^USR/, "");
            }
            if (v.length > 3) {
                v = v.slice(0, 3) + "-" + v.slice(3, 8);
            }
            input.value = v;
        });
    }

    toggleChatMenu() {
        const menu = document.getElementById("chatMenu");
        if (!menu) return;
        menu.style.display =
            menu.style.display === "block" ? "none" : "block";
    }

    hideChatMenu() {
        const menu = document.getElementById("chatMenu");
        if (!menu) return;
        menu.style.display = "none";
    }

    showUndoNotification() {
        const el = document.getElementById("undoNotification");
        if (!el) return;
        el.style.display = "block";
    }

    hideUndoNotification() {
        const el = document.getElementById("undoNotification");
        if (!el) return;
        el.style.display = "none";
    }

    async handleRegistration() {
        const username = document
            .getElementById("signupUsername")
            .value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password =
            document.getElementById("signupPassword").value || "";

        if (!username || !email || !password) {
            this.showStatus("Please fill in all fields", "error");
            return;
        }

        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });

            const data = await res.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this;
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message || "Account created", "success");
            } else {
                this.showStatus(data.error || "Registration failed", "error");
            }
        } catch (err) {
            this.showStatus("Registration failed.", "error");
        }
    }

    async handleQuickLogin() {
        const userId =
            document.getElementById("quickLoginUserId").value.trim();

        if (!userId) {
            this.showStatus("Enter Student ID", "error");
            return;
        }
        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId })
            });

            const data = await res.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this;
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message || "Login successful", "success");
            } else {
                this.showStatus(data.error || "Login failed", "error");
            }
        } catch (err) {
            this.showStatus("Login failed.", "error");
        }
    }

    async handleEmailLogin() {
        const email = document.getElementById("emailLoginEmail").value.trim();
        const password = document.getElementById("emailLoginPassword").value;

        if (!email || !password) {
            this.showStatus("Fill all fields", "error");
            return;
        }

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                this.currentUser = data.user;
                window.chatClient = this;
                this.socket.emit("user-online", this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message || "Login successful", "success");
            } else {
                this.showStatus(data.error || "Login failed", "error");
            }
        } catch (err) {
            this.showStatus("Login failed.", "error");
        }
    }

    async startChat(username) {
        if (!this.currentUser) {
            this.showStatus("Login first", "error");
            return;
        }

        this.currentRecipient = username;

        document.getElementById("chatUsername").textContent =
            `Chat with ${username}`;
        document.getElementById("chatHeader").style.display = "flex";
        document.getElementById("chatInput").style.display = "block";
        document.getElementById("messageInput").disabled = false;
        document.getElementById("sendBtn").disabled = false;
        document.getElementById("messageInput").focus();

        document.getElementById("searchResults").innerHTML = "";

        await this.loadChatMessages();
        await this.updateChatListUI();

        this.showStatus(`Started chat with ${username}`, "success");
    }

    async loadChatMessages() {
        if (!this.currentRecipient) return;

        const container = document.getElementById("messagesContainer");
        container.innerHTML = "";

        try {
            const res = await fetch(
                `/api/messages/${this.getChatId(
                    this.currentUser.username,
                    this.currentRecipient
                )}`
            );

            const data = await res.json();
            const messages = data.messages || data;

            if (messages.length === 0) {
                container.innerHTML =
                    "<div class='no-messages'>No messages yet.</div>";
                return;
            }

            messages.forEach((msg) => this.displayMessage(msg));
            container.scrollTop = container.scrollHeight;
        } catch (err) {}
    }

    displayMessage(message) {
        const container = document.getElementById("messagesContainer");

        const div = document.createElement("div");
        div.className =
            "message " +
            (message.from === this.currentUser.username ? "own" : "received");
        div.dataset.messageId = message.id;

        div.innerHTML = `
            <div class="message-avatar">
                ${message.from[0].toUpperCase()}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">${message.text}</div>
                    <div class="message-meta">
                        <span class="message-time">
                            ${new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    updateMessageStatus(id, status) {
        const msg = document.querySelector(`[data-message-id="${id}"]`);
        if (!msg) return;

        let el = msg.querySelector(".message-status");
        if (!el) {
            el = document.createElement("span");
            el.className = "message-status";
            msg.querySelector(".message-meta").appendChild(el);
        }

        el.textContent = status;
    }

    sendMessage() {
        const input = document.getElementById("messageInput");
        const text = input.value.trim();

        if (!text || !this.currentRecipient) return;

        const id =
            "msg_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);

        this.socket.emit("send-message", {
            from: this.currentUser.username,
            to: this.currentRecipient,
            text,
            messageId: id
        });

        this.lastSentMessageId = id;
        input.value = "";
        this.stopTyping();
    }

    unsendLastMessage() {
        if (!this.lastSentMessageId) return;

        this.socket.emit("unsend-message", {
            messageId: this.lastSentMessageId,
            from: this.currentUser.username,
            to: this.currentRecipient
        });

        this.lastSentMessageId = null;
    }

    async searchUsers() {
        const q = document.getElementById("searchInput").value.trim();
        if (!q) return;

        try {
            const res = await fetch(
                `/api/users/search?query=${encodeURIComponent(
                    q
                )}&currentUser=${encodeURIComponent(
                    this.currentUser.username
                )}`
            );

            const data = await res.json();
            this.displaySearchResults(data);
        } catch (err) {}
    }

    displaySearchResults(results) {
        const container = document.getElementById("searchResults");
        container.innerHTML = "";

        if (results.length === 0) {
            container.innerHTML =
                "<div style='padding:1rem;text-align:center;color:#666;'>No users found</div>";
            return;
        }

        results.forEach((u) => {
            const div = document.createElement("div");
            div.className = "search-result-item";

            div.innerHTML = `
                <div>
                    <div style="font-weight:bold;">${u.username}</div>
                    <div style="font-size:0.8rem;color:#666;">Student ID: ${u.userId}</div>
                </div>
                <button class="add-user-btn" onclick="chatClient.startChat('${u.username}')">Chat</button>
            `;

            container.appendChild(div);
        });
    }

    handleTyping() {
        if (!this.currentRecipient) return;

        this.socket.emit("typing-start", {
            from: this.currentUser.username,
            to: this.currentRecipient
        });

        clearTimeout(this.typingTimeout);

        this.typingTimeout = setTimeout(() => this.stopTyping(), 3000);
    }

    stopTyping() {
        if (!this.currentRecipient) return;

        this.socket.emit("typing-stop", {
            from: this.currentUser.username,
            to: this.currentRecipient
        });
    }

    showTypingIndicator(username, isTyping) {
        const el = document.getElementById("typingIndicator");

        if (isTyping) {
            el.innerHTML = `${username} is typing...`;
            el.style.display = "block";
        } else {
            el.style.display = "none";
        }
    }

    async updateChatListUI() {
        if (!this.currentUser) return;

        try {
            const res = await fetch(`/api/chats/${this.currentUser.username}`);
            const data = await res.json();
            const chats = data.chats || data;

            const list = document.getElementById("userList");
            list.innerHTML = "";

            chats.forEach((ch) => {
                const li = document.createElement("li");
                li.className = "user-item";
                li.onclick = () => this.startChat(ch.username);

                li.innerHTML = `
                    <div class="chat-item-header">
                        <div class="chat-item-avatar">${ch.username[0]}</div>
                        <div class="chat-item-info">
                            <div class="chat-item-name">${ch.username}</div>
                            <div class="chat-item-preview">${ch.lastMessage || ""}</div>
                        </div>
                    </div>
                `;

                list.appendChild(li);
            });
        } catch (err) {}
    }

    clearChat() {
        this.socket.emit("clear-chat", {
            username: this.currentUser.username,
            chatUser: this.currentRecipient
        });
    }

    undoClearChat() {
        this.socket.emit("undo-clear-chat", {
            username: this.currentUser.username,
            chatUser: this.currentRecipient
        });
    }

    showChatInterface() {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("mainApp").style.display = "flex";

        document.getElementById("currentUsername").textContent =
            this.currentUser.username;
        document.getElementById("currentUserId").textContent =
            this.currentUser.userId;
        document.getElementById("currentUserAvatar").textContent =
            this.currentUser.username[0].toUpperCase();

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

        this.showStatus("Logged out", "success");
    }

    showStatus(message, type = "info") {
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
}

let chatClient;

document.addEventListener("DOMContentLoaded", () => {
    chatClient = new ChatClient();
});

        
