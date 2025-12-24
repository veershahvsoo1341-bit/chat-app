const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory database (in production, use a real database like MongoDB, PostgreSQL, etc.)
let users = [];
let messages = [];
let chatLists = {};
let onlineUsers = new Map();

// Data persistence functions
async function saveData() {
    try {
        const data = {
            users,
            messages,
            chatLists,
            timestamp: Date.now()
        };
        await fs.writeFile('data.json', JSON.stringify(data, null, 2));
        console.log('💾 Data saved to file');
    } catch (error) {
        console.error('❌ Error saving data:', error);
    }
}

async function loadData() {
    try {
        const data = await fs.readFile('data.json', 'utf8');
        const parsed = JSON.parse(data);
        users = parsed.users || [];
        messages = parsed.messages || [];
        chatLists = parsed.chatLists || {};
        console.log('📂 Data loaded from file');
        console.log(`👥 Loaded ${users.length} users, ${messages.length} messages`);
    } catch (error) {
        console.log('📝 No existing data file, starting fresh');
    }
}

// Auto-save data every 30 seconds
setInterval(saveData, 30000);

// Helper functions
function generateUserId() {
    return 'USR-' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function getChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

function cleanupOldMessages() {
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    const initialCount = messages.length;
    messages = messages.filter(msg => msg.timestamp > threeDaysAgo);
    const cleanedCount = initialCount - messages.length;
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old messages`);
        saveData();
    }
}

// Run cleanup every hour
setInterval(cleanupOldMessages, 60 * 60 * 1000);

// API Routes
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if email already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
    }
    
    const userId = generateUserId();
    const newUser = {
        userId,
        username,
        email,
        password,
        createdAt: Date.now(),
        lastSeen: Date.now()
    };
    
    users.push(newUser);
    chatLists[username] = [];
    saveData();
    
    res.json({ 
        success: true, 
        user: { userId, username, email },
        message: `Welcome ${username}! Your Student ID is ${userId}`
    });
});

app.post('/api/login', (req, res) => {
    const { userId, email, password } = req.body;
    
    let user;
    if (userId) {
        user = users.find(u => u.userId === userId);
    } else if (email && password) {
        user = users.find(u => u.email === email && u.password === password);
    }
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last seen
    user.lastSeen = Date.now();
    saveData();
    
    res.json({ 
        success: true, 
        user: { userId: user.userId, username: user.username, email: user.email },
        message: `Welcome back ${user.username}!`
    });
});

app.get('/api/users/search', (req, res) => {
    const { query, currentUser } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    const results = users.filter(user => {
        if (user.username === currentUser) return false;
        
        const usernameMatch = user.username.toLowerCase().includes(query.toLowerCase());
        const userIdMatch = user.userId.toLowerCase().includes(query.toLowerCase());
        
        return usernameMatch || userIdMatch;
    }).map(user => ({
        userId: user.userId,
        username: user.username
    }));
    
    res.json(results);
});

app.get('/api/messages/:chatId', (req, res) => {
    const { chatId } = req.params;
    const chatMessages = messages.filter(msg => msg.chatId === chatId)
                                .sort((a, b) => a.timestamp - b.timestamp);
    res.json(chatMessages);
});

app.get('/api/chats/:username', (req, res) => {
    const { username } = req.params;
    const userChatList = chatLists[username] || [];
    
    // Update online status for each chat
    const updatedChatList = userChatList.map(chat => ({
        ...chat,
        isOnline: onlineUsers.has(chat.username)
    }));
    
    res.json(updatedChatList);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);
    
    socket.on('user-online', (username) => {
        onlineUsers.set(username, socket.id);
        socket.username = username;
        
        // Update user's last seen
        const user = users.find(u => u.username === username);
        if (user) {
            user.lastSeen = Date.now();
        }
        
        // Broadcast online status to all clients
        socket.broadcast.emit('user-status-change', { username, isOnline: true });
        console.log(`🟢 ${username} is online`);
    });
    
    socket.on('send-message', (data) => {
        const { from, to, text, messageId } = data;
        
        const message = {
            id: messageId,
            from,
            to,
            text,
            timestamp: Date.now(),
            chatId: getChatId(from, to),
            status: 'sent',
            isUnsent: false
        };
        
        messages.push(message);
        
        // Update chat lists for both users
        updateChatList(from, to, message);
        updateChatList(to, from, message);
        
        // Send to recipient if online
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-message', message);
            
            // Update message status to delivered
            setTimeout(() => {
                message.status = 'delivered';
                socket.emit('message-status-update', { messageId, status: 'delivered' });
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('message-status-update', { messageId, status: 'delivered' });
                }
            }, 100);
            
            // Update to read status
            setTimeout(() => {
                message.status = 'read';
                socket.emit('message-status-update', { messageId, status: 'read' });
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('message-status-update', { messageId, status: 'read' });
                }
            }, 200);
        }
        
        // Send back to sender
        socket.emit('message-sent', message);
        
        saveData();
    });
    
    socket.on('unsend-message', (data) => {
        const { messageId, from, to } = data;
        
        const message = messages.find(msg => msg.id === messageId);
        if (message && message.from === from) {
            message.isUnsent = true;
            message.text = 'This message was unsent';
            message.unsentAt = Date.now();
            
            // Notify both users
            socket.emit('message-unsent', { messageId, text: 'This message was unsent' });
            
            const recipientSocketId = onlineUsers.get(to);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('message-unsent', { messageId, text: 'This message was unsent' });
            }
            
            // Update chat lists
            updateChatList(from, to, message);
            updateChatList(to, from, message);
            
            saveData();
        }
    });
    
    socket.on('clear-chat', (data) => {
        const { username, chatUser } = data;
        
        // Get messages for this chat
        const chatMessages = messages.filter(msg => 
            (msg.from === username && msg.to === chatUser) ||
            (msg.from === chatUser && msg.to === username)
        );
        
        // Send cleared messages back for undo functionality
        socket.emit('chat-cleared', { 
            chatUser, 
            clearedMessages: chatMessages,
            timestamp: Date.now()
        });
        
        // Update chat list
        const userChatList = chatLists[username] || [];
        const chatIndex = userChatList.findIndex(chat => chat.username === chatUser);
        if (chatIndex !== -1) {
            userChatList[chatIndex].lastMessage = 'No messages yet';
            userChatList[chatIndex].lastMessageTime = Date.now();
            userChatList[chatIndex].unreadCount = 0;
        }
        
        saveData();
    });
    
    socket.on('restore-chat', (data) => {
        const { username, chatUser, clearedMessages } = data;
        
        // Restore messages (they were never actually deleted from server)
        socket.emit('chat-restored', { chatUser, messages: clearedMessages });
        
        // Update chat list with last message
        if (clearedMessages.length > 0) {
            const lastMessage = clearedMessages[clearedMessages.length - 1];
            updateChatList(username, chatUser, lastMessage);
        }
        
        saveData();
    });
    
    socket.on('typing-start', (data) => {
        const { from, to } = data;
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('user-typing', { username: from, isTyping: true });
        }
    });
    
    socket.on('typing-stop', (data) => {
        const { from, to } = data;
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('user-typing', { username: from, isTyping: false });
        }
    });
    
    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            
            // Update user's last seen
            const user = users.find(u => u.username === socket.username);
            if (user) {
                user.lastSeen = Date.now();
            }
            
            // Broadcast offline status
            socket.broadcast.emit('user-status-change', { 
                username: socket.username, 
                isOnline: false 
            });
            
            console.log(`🔴 ${socket.username} went offline`);
            saveData();
        }
        console.log('👤 User disconnected:', socket.id);
    });
});

function updateChatList(username, otherUser, message) {
    if (!chatLists[username]) {
        chatLists[username] = [];
    }
    
    const chatList = chatLists[username];
    let chat = chatList.find(c => c.username === otherUser);
    
    if (!chat) {
        chat = {
            username: otherUser,
            chatId: getChatId(username, otherUser),
            lastMessage: '',
            lastMessageTime: Date.now(),
            unreadCount: 0,
            isOnline: onlineUsers.has(otherUser),
            addedAt: Date.now()
        };
        chatList.push(chat);
    }
    
    chat.lastMessage = message.text;
    chat.lastMessageTime = message.timestamp;
    
    // Increment unread count if message is not from current user
    if (message.from !== username) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;

// Load data on startup
loadData().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📱 Chat app available at http://localhost:${PORT}`);
        console.log(`👥 ${users.length} users in database`);
        console.log(`💬 ${messages.length} messages in database`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await saveData();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down server...');
    await saveData();
    process.exit(0);
});