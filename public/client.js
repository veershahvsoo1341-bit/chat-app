// Real-time Chat Client with Socket.IO
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

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('🔗 Connected to server');
            if (this.currentUser) {
                this.socket.emit('user-online', this.currentUser.username);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
        });

        this.socket.on('new-message', (message) => {
            this.displayMessage(message);
            this.updateChatListUI();
        });

        this.socket.on('message-sent', (message) => {
            this.displayMessage(message);
            this.updateChatListUI();
        });

        this.socket.on('message-status-update', (data) => {
            this.updateMessageStatus(data.messageId, data.status);
        });

        this.socket.on('message-unsent', (data) => {
            const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                const textElement = messageElement.querySelector('.message-text');
                if (textElement) {
                    textElement.innerHTML = '<em style="color: #999; font-style: italic;">This message was unsent</em>';
                }
            }
            this.updateChatListUI();
        });

        this.socket.on('chat-cleared', (data) => {
            this.tempClearedMessages = {
                messages: data.clearedMessages,
                timestamp: data.timestamp,
                chatUser: data.chatUser
            };
            
            // Clear the chat display
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '<div class="no-messages">No messages yet. Start a conversation!</div>';
            }
            
            this.showUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on('chat-restored', (data) => {
            if (this.currentRecipient === data.chatUser) {
                this.loadChatMessages();
            }
            this.tempClearedMessages = null;
            this.hideUndoNotification();
            this.updateChatListUI();
        });

        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data.username, data.isTyping);
        });

        this.socket.on('user-status-change', (data) => {
            this.updateChatListUI();
        });
    }

    setupEventListeners() {
        console.log('🔧 Setting up event listeners...');
        
        // Form event listeners
        const signupForm = document.getElementById('signupFormElement');
        const quickLoginForm = document.getElementById('quickLoginForm');
        const emailLoginForm = document.getElementById('emailLoginFormElement');
            
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegistration();
            });
        }
        
        if (quickLoginForm) {
            quickLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleQuickLogin();
            });
        }
        
        if (emailLoginForm) {
            emailLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEmailLogin();
            });
        }

        // Form switching events
        const showSignup = document.getElementById('showSignup');
        const showLogin = document.getElementById('showLogin');
        const showEmailLogin = document.getElementById('showEmailLogin');
        const showLoginFromEmail = document.getElementById('showLoginFromEmail');
        const showSignupFromEmail = document.getElementById('showSignupFromEmail');
        
        if (showSignup) {
            showSignup.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSignupForm();
            });
        }
        
        if (showLogin) {
            showLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }
        
        if (showEmailLogin) {
            showEmailLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showEmailLoginForm();
            });
        }
        
        if (showLoginFromEmail) {
            showLoginFromEmail.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }
        
        if (showSignupFromEmail) {
            showSignupFromEmail.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSignupForm();
            });
        }

        // Chat interface events
        const sendBtn = document.getElementById('sendBtn');
        const unsendMessageBtn = document.getElementById('unsendMessageBtn');
        const messageInput = document.getElementById('messageInput');
        const searchBtn = document.getElementById('searchBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const chatMenuBtn = document.getElementById('chatMenuBtn');
        const clearChatBtn = document.getElementById('clearChatBtn');
        
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (unsendMessageBtn) {
            unsendMessageBtn.addEventListener('click', () => this.unsendLastMessage());
        }

        if (chatMenuBtn) {
            chatMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleChatMenu();
            });
        }

        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => {
                this.clearChat();
                this.hideChatMenu();
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            this.hideChatMenu();
        });
        
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                } else {
                    this.handleTyping();
                }
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchUsers());
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // Add Student ID input formatting
        const studentIdInput = document.getElementById('quickLoginUserId');
        if (studentIdInput) {
            this.setupStudentIdFormatting(studentIdInput);
        }

        // Add Student ID formatting to search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            this.setupStudentIdFormatting(searchInput);
            
            // Add Enter key support for search
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchUsers();
                }
            });
        }
    }

    showLoginForm() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('signupForm').classList.add('hidden');
        document.getElementById('emailLoginForm').classList.add('hidden');
    }

    showSignupForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('signupForm').classList.remove('hidden');
        document.getElementById('emailLoginForm').classList.add('hidden');
        this.generateStudentId();
    }

    showEmailLoginForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('signupForm').classList.add('hidden');
        document.getElementById('emailLoginForm').classList.remove('hidden');
    }

    setupStudentIdFormatting(input) {
        input.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase();
            
            if (value.startsWith('USR-')) {
                value = value.substring(4);
            }
            
            value = value.replace(/[^A-Z0-9]/g, '');
            
            if (value.length > 0) {
                e.target.value = 'USR-' + value;
            } else {
                e.target.value = '';
            }
        });

        input.addEventListener('focus', (e) => {
            if (e.target.value === '') {
                e.target.value = 'USR-';
                setTimeout(() => {
                    e.target.setSelectionRange(4, 4);
                }, 0);
            }
        });

        input.addEventListener('blur', (e) => {
            if (e.target.value === 'USR-') {
                e.target.value = '';
            }
        });

        input.addEventListener('keydown', (e) => {
            const value = e.target.value;
            const cursorPos = e.target.selectionStart;
            
            if ((e.key === 'Backspace' || e.key === 'Delete') && cursorPos <= 4 && value.startsWith('USR-')) {
                e.preventDefault();
            }
        });
    }

    generateStudentId() {
        const generatedId = 'USR-' + Math.random().toString(36).substr(2, 5).toUpperCase();
        const generatedIdElement = document.getElementById('generatedId');
        if (generatedIdElement) {
            generatedIdElement.textContent = generatedId;
        }
    }

    async handleRegistration() {
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;

        if (!username || !email || !password) {
            this.showStatus('Please fill in all fields', 'error');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.socket.emit('user-online', this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, 'success');
            } else {
                this.showStatus(data.error, 'error');
            }
        } catch (error) {
            this.showStatus('Registration failed. Please try again.', 'error');
        }
    }

    async handleQuickLogin() {
        const userId = document.getElementById('quickLoginUserId').value.trim();

        if (!userId) {
            this.showStatus('Please enter your Student ID', 'error');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.socket.emit('user-online', this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, 'success');
            } else {
                this.showStatus(data.error, 'error');
            }
        } catch (error) {
            this.showStatus('Login failed. Please try again.', 'error');
        }
    }

    async handleEmailLogin() {
        const email = document.getElementById('emailLoginEmail').value.trim();
        const password = document.getElementById('emailLoginPassword').value;

        if (!email || !password) {
            this.showStatus('Please fill in all fields', 'error');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.socket.emit('user-online', this.currentUser.username);
                this.showChatInterface();
                this.showStatus(data.message, 'success');
            } else {
                this.showStatus(data.error, 'error');
            }
        } catch (error) {
            this.showStatus('Login failed. Please try again.', 'error');
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const text = messageInput.value.trim();

        if (!text || !this.currentRecipient) {
            this.showStatus('Please enter a message and select a recipient', 'error');
            return;
        }

        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        this.socket.emit('send-message', {
            from: this.currentUser.username,
            to: this.currentRecipient,
            text: text,
            messageId: messageId
        });

        // Track last sent message for unsend functionality
        this.lastSentMessageId = messageId;
        this.showUnsendButton();

        messageInput.value = '';
        this.stopTyping();
    }

    async searchUsers() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();

        if (!query) {
            this.showStatus('Please enter a search term', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/users/search?query=${encodeURIComponent(query)}&currentUser=${encodeURIComponent(this.currentUser.username)}`);
            const results = await response.json();
            this.displaySearchResults(results);
        } catch (error) {
            this.showStatus('Search failed. Please try again.', 'error');
        }
    }

    handleTyping() {
        if (!this.currentRecipient) return;

        this.socket.emit('typing-start', {
            from: this.currentUser.username,
            to: this.currentRecipient
        });

        clearTimeout(this.typingTimeout);
        
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 3000);
    }

    stopTyping() {
        if (!this.currentRecipient) return;
        
        this.socket.emit('typing-stop', {
            from: this.currentUser.username,
            to: this.currentRecipient
        });
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        // Check if message already exists
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.from === this.currentUser.username ? 'own' : 'received'}`;
        messageDiv.dataset.messageId = message.id;

        const time = new Date(message.timestamp).toLocaleTimeString();
        const isOwn = message.from === this.currentUser.username;
        
        let statusIcon = '';
        if (isOwn) {
            switch (message.status) {
                case 'sent':
                    statusIcon = '<span class="status-icon status-sent">✓</span>';
                    break;
                case 'delivered':
                    statusIcon = '<span class="status-icon status-delivered">✓✓</span>';
                    break;
                case 'read':
                    statusIcon = '<span class="status-icon status-read">✓✓</span>';
                    break;
            }
        }

        const messageText = message.isUnsent ? 
            '<em style="color: #999; font-style: italic;">This message was unsent</em>' : 
            message.text;

        messageDiv.innerHTML = `
            <div class="message-avatar">${message.from.charAt(0).toUpperCase()}</div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">${messageText}</div>
                    <div class="message-meta">
                        <span class="message-time">${time}</span>
                        <div class="message-status">
                            ${statusIcon}
                        </div>
                    </div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    displaySearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;

        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.innerHTML = '<div style="padding: 1rem; text-align: center; color: #666;">No users found</div>';
            return;
        }

        results.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'search-result-item';
            userDiv.innerHTML = `
                <div>
                    <div style="font-weight: bold;">${user.username}</div>
                    <div style="font-size: 0.8rem; color: #666;">
                        Student ID: ${user.userId}
                    </div>
                </div>
                <button class="add-user-btn" onclick="chatClient.startChat('${user.username}')">Chat</button>
            `;
            searchResults.appendChild(userDiv);
        });
    }

    async startChat(username) {
        this.currentRecipient = username;
        
        // Hide unsend button when switching chats
        this.hideUnsendButton();
        
        // Update chat header
        const chatHeader = document.getElementById('chatHeader');
        const chatUsername = document.getElementById('chatUsername');
        if (chatHeader && chatUsername) {
            chatUsername.textContent = `Chat with ${username}`;
            chatHeader.style.display = 'flex';
        }

        // Show chat input
        const chatInput = document.getElementById('chatInput');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (chatInput) chatInput.style.display = 'block';
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.focus();
        }
        if (sendBtn) sendBtn.disabled = false;

        // Clear search results
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = '';
        }

        // Load chat messages
        await this.loadChatMessages();
        
        // Update chat list UI
        await this.updateChatListUI();

        this.showStatus(`Started chat with ${username}`, 'success');
    }

    async loadChatMessages() {
        if (!this.currentRecipient) return;

        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        const chatId = this.getChatId(this.currentUser.username, this.currentRecipient);
        
        try {
            const response = await fetch(`/api/messages/${chatId}`);
            const messages = await response.json();
            
            messages.forEach(message => {
                this.displayMessage(message);
            });
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    showTypingIndicator(username, isTyping) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (!typingIndicator) return;

        if (isTyping && username === this.currentRecipient) {
            typingIndicator.innerHTML = `
                <div class="typing-indicator">
                    <div class="typing-avatar">${username.charAt(0).toUpperCase()}</div>
                    <div class="typing-bubble">
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            `;
            typingIndicator.style.display = 'block';
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status .status-icon');
            if (statusElement) {
                statusElement.className = `status-icon status-${status}`;
                switch (status) {
                    case 'sent':
                        statusElement.textContent = '✓';
                        break;
                    case 'delivered':
                        statusElement.textContent = '✓✓';
                        break;
                    case 'read':
                        statusElement.textContent = '✓✓';
                        break;
                }
            }
        }
    }

    showChatInterface() {
        const authScreen = document.getElementById('authScreen');
        const mainApp = document.getElementById('mainApp');
        
        if (authScreen) authScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';

        // Update user info in sidebar
        if (this.currentUser) {
            const currentUsername = document.getElementById('currentUsername');
            const currentUserId = document.getElementById('currentUserId');
            const currentUserAvatar = document.getElementById('currentUserAvatar');
            
            if (currentUsername) currentUsername.textContent = this.currentUser.username;
            if (currentUserId) currentUserId.textContent = this.currentUser.userId;
            if (currentUserAvatar) currentUserAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
        }

        // Load and display chat list
        this.updateChatListUI();
    }

    logout() {
        // Reset state
        this.currentUser = null;
        this.currentRecipient = null;

        // Show auth screen
        const authScreen = document.getElementById('authScreen');
        const mainApp = document.getElementById('mainApp');
        
        if (authScreen) authScreen.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';

        // Clear forms
        document.getElementById('quickLoginUserId').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupUsername').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('emailLoginEmail').value = '';
        document.getElementById('emailLoginPassword').value = '';

        this.showStatus('Logged out successfully', 'success');
    }

    showStatus(message, type = 'info') {
        console.log(`📢 Status (${type}):`, message);
        
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-message status-${type}`;
            statusElement.style.display = 'block';
            
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }

    getChatId(user1, user2) {
        return [user1, user2].sort().join('_');
    }

    // ===== ENHANCED UNSEND FUNCTIONALITY =====

    showUnsendButton() {
        const unsendBtn = document.getElementById('unsendMessageBtn');
        if (unsendBtn && this.lastSentMessageId) {
            unsendBtn.style.display = 'flex';
            unsendBtn.disabled = false;
        }
    }

    hideUnsendButton() {
        const unsendBtn = document.getElementById('unsendMessageBtn');
        if (unsendBtn) {
            unsendBtn.style.display = 'none';
            unsendBtn.disabled = true;
        }
        this.lastSentMessageId = null;
    }

    unsendLastMessage() {
        if (!this.lastSentMessageId) {
            this.showStatus('No recent message to unsend', 'error');
            return;
        }

        this.socket.emit('unsend-message', {
            messageId: this.lastSentMessageId,
            from: this.currentUser.username,
            to: this.currentRecipient
        });

        this.hideUnsendButton();
        this.showStatus('Message unsent successfully', 'success');
    }

    // ===== CHAT LIST MANAGEMENT =====

    async updateChatListUI() {
        if (!this.currentUser) return;

        const userList = document.getElementById('userList');
        if (!userList) return;

        try {
            const response = await fetch(`/api/chats/${this.currentUser.username}`);
            const chatList = await response.json();
            
            // Sort by last message time (most recent first)
            chatList.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

            userList.innerHTML = '';

            if (chatList.length === 0) {
                userList.innerHTML = '<li style="padding: 1rem; text-align: center; color: #666; font-style: italic;">No chats yet. Search for users to start chatting!</li>';
                return;
            }

            chatList.forEach(chat => {
                const userItem = document.createElement('li');
                userItem.className = `user-item ${this.currentRecipient === chat.username ? 'active' : ''}`;
                userItem.onclick = () => this.startChat(chat.username);

                const lastMessageTime = this.formatLastMessageTime(chat.lastMessageTime);
                const unreadBadge = chat.unreadCount > 0 ? 
                    `<span class="unread-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
                
                const onlineStatus = chat.isOnline ? 
                    '<span class="online-indicator"></span>' : 
                    '<span class="offline-indicator"></span>';

                userItem.innerHTML = `
                    <div class="chat-item-content">
                        <div class="chat-item-header">
                            <div class="chat-item-avatar">
                                ${chat.username.charAt(0).toUpperCase()}
                                ${onlineStatus}
                            </div>
                            <div class="chat-item-info">
                                <div class="chat-item-name">${chat.username}</div>
                                <div class="chat-item-preview">${this.truncateMessage(chat.lastMessage || 'No messages yet')}</div>
                            </div>
                            <div class="chat-item-meta">
                                <div class="chat-item-time">${lastMessageTime}</div>
                                ${unreadBadge}
                            </div>
                        </div>
                    </div>
                `;

                userList.appendChild(userItem);
            });
        } catch (error) {
            console.error('Error updating chat list:', error);
        }
    }

    formatLastMessageTime(timestamp) {
        const now = new Date();
        const messageTime = new Date(timestamp);
        const diffInMinutes = Math.floor((now - messageTime) / (1000 * 60));
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInMinutes < 1) {
            return 'now';
        } else if (diffInMinutes < 60) {
            return `${diffInMinutes}m`;
        } else if (diffInHours < 24) {
            return `${diffInHours}h`;
        } else if (diffInDays < 7) {
            return `${diffInDays}d`;
        } else {
            return messageTime.toLocaleDateString();
        }
    }

    truncateMessage(message, maxLength = 30) {
        if (message.length <= maxLength) return message;
        return message.substring(0, maxLength) + '...';
    }

    // ===== CHAT MANAGEMENT FEATURES =====

    toggleChatMenu() {
        const menu = document.getElementById('chatMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
    }

    hideChatMenu() {
        const menu = document.getElementById('chatMenu');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    clearChat() {
        if (!this.currentRecipient) {
            console.log('No active chat to clear');
            return;
        }

        this.socket.emit('clear-chat', {
            username: this.currentUser.username,
            chatUser: this.currentRecipient
        });

        this.showStatus(`Chat with ${this.currentRecipient} cleared`, 'success');
    }

    showUndoNotification() {
        const notification = document.getElementById('undoNotification');
        if (!notification) return;

        notification.style.display = 'block';
        
        let countdown = 5;
        const countdownElement = document.getElementById('undoCountdown');
        const undoBtn = document.getElementById('undoBtn');
        
        // Add event listener for undo button
        if (undoBtn) {
            undoBtn.onclick = () => this.restoreChat();
        }
        
        // Update countdown display
        const updateCountdown = () => {
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            countdown--;
            
            if (countdown < 0) {
                // Time's up - permanently delete
                this.permanentlyDeleteMessages();
                this.hideUndoNotification();
            } else {
                // Continue countdown
                setTimeout(updateCountdown, 1000);
            }
        };

        // Start countdown
        updateCountdown();
    }

    hideUndoNotification() {
        const notification = document.getElementById('undoNotification');
        if (notification) {
            notification.style.display = 'none';
        }
    }

    restoreChat() {
        if (!this.tempClearedMessages) {
            console.log('No messages to restore');
            return;
        }

        this.socket.emit('restore-chat', {
            username: this.currentUser.username,
            chatUser: this.tempClearedMessages.chatUser,
            clearedMessages: this.tempClearedMessages.messages
        });

        this.showStatus('Chat restored successfully', 'success');
    }

    permanentlyDeleteMessages() {
        if (this.tempClearedMessages) {
            console.log(`Messages permanently deleted for chat with ${this.tempClearedMessages.chatUser}`);
            this.tempClearedMessages = null;
            this.showStatus('Messages permanently deleted', 'info');
        }
    }
}

// Initialize the chat client
let chatClient;
document.addEventListener('DOMContentLoaded', () => {
    chatClient = new ChatClient();
});
