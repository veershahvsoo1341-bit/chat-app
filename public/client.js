/*  ============================
    ChatClient — Enhanced Version
    ============================ */

class ChatClient {
    constructor() {
        this.currentUser = null;
        this.currentRecipient = null;
        this.socket = null;
        this.typingTimeout = null;
        this.lastSentMessageId = null;
        this.tempClearedMessages = null;

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
            this.tempClearedMessages = data;
            document.getElementById("messagesContainer").innerHTML =
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
        this.socket.emit("user-online", this.currentUser.username);
        this.showChatInterface();
        this.showStatus(data.message, "success");
    }

    /* ============================
       CHAT LOADING
       ============================ */
    async startChat(username) {
        this.currentRecipient = username;

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

        const res = await fetch(`/api/messages/${this.getChatId(this.currentUser.username, this.currentRecipient)}`);
        const messages = await res.json();

        if (!messages.length) {
            container.innerHTML = "<div class='no-messages'>No messages yet.</div>";
            return;
        }

        messages.forEach((msg) => this.displayMessage(msg));
        container.scrollTop = container.scrollHeight;
    }

    /* ============================
       MESSAGE RENDERING
       ============================ */
    displayMessage(message) {
        const container = document.getElementById("messagesContainer");

        const div = document.createElement("div");
        div.className = "message " + (message.from === this.currentUser.username ? "own" : "received");
        div.dataset.messageId = message.id;

        div.innerHTML = `
            <div class="message-avatar">${message.from[0].toUpperCase()}</div>
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

        /* Reaction button click */
        div.querySelector(".reaction-btn").onclick = (e) => {
            e.stopPropagation();
            this.openReactionBar(message.id, div);
        };

        /* Long press / right click */
        div.oncontextmenu = (e) => {
            e.preventDefault();
            this.openReactionBar(message.id, div);
        };

        /* Double click to edit */
        if (message.from === this.currentUser.username && !message.isUnsent) {
            div.ondblclick = () => this.editMessagePrompt(message);
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
    openReactionBar(messageId, messageElement) {
        const bar = document.createElement("div");
        bar.className = "reaction-bar";

        this.reactionSet.forEach((emoji) => {
            const btn = document.createElement("button");
            btn.className = "reaction-option";
            btn.textContent = emoji;
            btn.onclick = () => {
                this.socket.emit("react-message", {
                    messageId,
                    from: this.currentUser.username,
                    to: this.currentRecipient,
                    reaction: emoji
                });
                bar.remove();
            };
            bar.appendChild(btn);
        });

        messageElement.appendChild(bar);

        setTimeout(() => {
            document.addEventListener("click", () => bar.remove(), { once: true });
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
    editMessagePrompt(message) {
        const newText = prompt("Edit your message:", message.text);
        if (!newText || newText.trim() === message.text) return;

        this.socket.emit("edit-message", {
            messageId: message.id,
            from: this.currentUser.username,
            to: this.currentRecipient,
            newText
        });
    }

    /* ============================
       SEND / UNSEND
       ============================ */
    sendMessage() {
        const input = document.getElementById("messageInput");
        const text = input.value.trim();
        if (!text) return;

        const id = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

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

    /* ============================
       TYPING INDICATOR
       ============================ */
    handleTyping() {
        this.socket.emit("typing-start", {
            from: this.currentUser.username,
            to: this.currentRecipient
        });

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => this.stopTyping(), 2000);
    }

    stopTyping() {
        this.socket.emit("typing-stop", {
            from: this.currentUser.username,
            to: this.currentRecipient
        });
    }

    showTypingIndicator(username, isTyping) {
        const el = document.getElementById("typingIndicator");
        el.style.display = isTyping ? "block" : "none";
        el.textContent = isTyping ? `${username} is typing...` : "";
    }

    /* ============================
       CHAT LIST
       ============================ */
    async updateChatListUI() {
        const res = await fetch(`/api/chats/${this.currentUser.username}`);
        const chats = await res.json();

        const list = document.getElementById("userList");
        list.innerHTML = "";

        chats.forEach((ch) => {
            const li = document.createElement("li");
            li.className = "user-item";
            li.onclick = () => this.startChat(ch.username);

            li.innerHTML = `
                <div class="chat-item-header">
                    <div class="chat-item-avatar">
                        ${ch.username[0]}
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
       CLEAR / UNDO
       ============================ */
    clearChat() {
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
       UI HELPERS
       ============================ */
    showChatInterface() {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("mainApp").style.display = "flex";

        document.getElementById("currentUsername").textContent = this.currentUser.username;
        document.getElementById("currentUserId").textContent = this.currentUser.userId;
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
