const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // for existsSync, mkdirSync
//const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fsSync.existsSync(UPLOAD_DIR)) {
    fsSync.mkdirSync(UPLOAD_DIR);
}

// const multer = require("multer"); // multer commented out because it's not installed in this environment

// Multer storage and upload setup commented out to avoid runtime errors.
// If you want to re-enable file uploads later, uncomment and install multer:
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/");
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + "-" + file.originalname);
//   }
// });
// const upload = multer({ storage });

// If your code had an upload route using `upload.single(...)` or `upload.array(...)`,
// comment those routes too. Example replacement for an upload route:
//
// app.post("/api/upload", upload.single("file"), (req, res) => {
//   // file handling logic
//   res.json({ success: true });
// });
//
// Replace with a placeholder route so clients get a clear response:
app.post("/api/upload", (req, res) => {
  res.status(501).json({ success: false, error: "File uploads are disabled on this deployment." });
});


// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// In-memory data (persisted to data.json)
let users = [];
let messages = [];        // direct + group messages
let chatLists = {};       // per-user overview for direct chats
let onlineUsers = new Map(); // username -> socketId

// Groups: simple in-memory model
let groups = [];           // { id, name, members: [username], createdBy, createdAt }

// Data persistence functions
async function saveData() {
    try {
        const data = {
            users,
            messages,
            chatLists,
            groups,
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
        groups = parsed.groups || [];
        console.log('📂 Data loaded from file');
        console.log(`👥 Loaded ${users.length} users, ${messages.length} messages, ${groups.length} groups`);
    } catch (error) {
        console.log('📝 No existing data file, starting fresh');
    }
}

// Auto-save data every 30 seconds
setInterval(saveData, 30000);

// Helpers
function generateUserId() {
    return 'USR-' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function getChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

function generateGroupId() {
    return 'GRP-' + Math.random().toString(36).substr(2, 8).toUpperCase();
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

// =======================
// REST API ROUTES
// =======================

// Register user (with optional profileImageUrl, darkMode preference)
app.post('/api/register', (req, res) => {
    const { username, email, password, profileImageUrl, prefersDarkMode } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const existingEmail = users.find(u => u.email === email);
    if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
    }

    const userId = generateUserId();
    const newUser = {
        userId,
        username,
        email,
        password,
        createdAt: Date.now(),
        lastSeen: Date.now(),
        profileImageUrl: profileImageUrl || null,
        prefersDarkMode: !!prefersDarkMode
    };

    users.push(newUser);
    if (!chatLists[username]) chatLists[username] = [];
    saveData();

    res.json({
        success: true,
        user: {
            userId,
            username,
            email,
            profileImageUrl: newUser.profileImageUrl,
            prefersDarkMode: newUser.prefersDarkMode
        },
        message: `Welcome ${username}! Your Student ID is ${userId}`
    });
});

// Login by userId or email/password
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

    user.lastSeen = Date.now();
    saveData();

    res.json({
        success: true,
        user: {
            userId: user.userId,
            username: user.username,
            email: user.email,
            profileImageUrl: user.profileImageUrl || null,
            prefersDarkMode: !!user.prefersDarkMode
        },
        message: `Welcome back ${user.username}!`
    });
});

// Update user preferences (e.g., dark mode, profile image URL)
app.post('/api/user/preferences', (req, res) => {
    const { username, profileImageUrl, prefersDarkMode } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (typeof profileImageUrl === 'string') user.profileImageUrl = profileImageUrl;
    if (typeof prefersDarkMode === 'boolean') user.prefersDarkMode = prefersDarkMode;

    saveData();
    res.json({ success: true, user });
});

// Search users
app.get('/api/users/search', (req, res) => {
    const { query, currentUser } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query required' });

    const results = users
        .filter(user => user.username !== currentUser)
        .filter(user => {
            const q = query.toLowerCase();
            return user.username.toLowerCase().includes(q) ||
                   user.userId.toLowerCase().includes(q) ||
                   (user.email && user.email.toLowerCase().includes(q));
        })
        .map(user => ({
            userId: user.userId,
            username: user.username,
            profileImageUrl: user.profileImageUrl || null
        }));

    res.json(results);
});

// Get direct chat messages by chatId
app.get('/api/messages/:chatId', (req, res) => {
    const { chatId } = req.params;
    const chatMessages = messages
        .filter(msg => !msg.isGroup && msg.chatId === chatId)
        .sort((a, b) => a.timestamp - b.timestamp);
    res.json(chatMessages);
});

// Get direct chat list for user
app.get('/api/chats/:username', (req, res) => {
    const { username } = req.params;
    const userChatList = chatLists[username] || [];

    const updated = userChatList.map(chat => ({
        ...chat,
        isOnline: onlineUsers.has(chat.username)
    }));

    res.json(updated);
});

// Get groups for a user
app.get('/api/groups/:username', (req, res) => {
    const { username } = req.params;
    const userGroups = groups.filter(g => g.members.includes(username));
    res.json(userGroups);
});

// Get messages for a group
app.get('/api/group-messages/:groupId', (req, res) => {
    const { groupId } = req.params;
    const groupMessages = messages
        .filter(msg => msg.isGroup && msg.groupId === groupId)
        .sort((a, b) => a.timestamp - b.timestamp);
    res.json(groupMessages);
});

// Upload endpoint for files (images, docs, voice)
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
        success: true,
        fileUrl,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
    });
});

// =======================
// SOCKET.IO
// =======================
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);

    // User comes online
    socket.on('user-online', (username) => {
        if (!username) return;
        onlineUsers.set(username, socket.id);
        socket.username = username;

        const user = users.find(u => u.username === username);
        if (user) user.lastSeen = Date.now();

        socket.broadcast.emit('user-status-change', { username, isOnline: true });
        console.log(`🟢 ${username} is online`);
        saveData();
    });

    // DIRECT MESSAGE
    socket.on('send-message', (data) => {
        const {
            from,
            to,
            text,
            messageId,
            type = 'text',   // 'text', 'image', 'file', 'audio'
            fileUrl = null,
            fileName = null,
            mimeType = null,
            duration = null  // for voice messages
        } = data;

        if (!from || !to) return;

        const message = {
            id: messageId,
            from,
            to,
            text: text || '',
            timestamp: Date.now(),
            chatId: getChatId(from, to),
            status: 'sent',
            isUnsent: false,
            isEdited: false,
            editedAt: null,
            reactions: [],
            isGroup: false,
            type,
            fileUrl,
            fileName,
            mimeType,
            duration
        };

        messages.push(message);

        // Update chat lists
        updateChatList(from, to, message);
        updateChatList(to, from, message);

        // Deliver to recipient if online
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-message', message);

            // delivered
            setTimeout(() => {
                message.status = 'delivered';
                socket.emit('message-status-update', { messageId, status: 'delivered' });
                io.to(recipientSocketId).emit('message-status-update', { messageId, status: 'delivered' });
            }, 100);

            // read (simple auto-read)
            setTimeout(() => {
                message.status = 'read';
                socket.emit('message-status-update', { messageId, status: 'read' });
                io.to(recipientSocketId).emit('message-status-update', { messageId, status: 'read' });
            }, 200);
        }

        // echo back to sender
        socket.emit('message-sent', message);
        saveData();
    });

    // EDIT DIRECT MESSAGE
    socket.on('edit-message', (data) => {
        const { messageId, from, to, newText } = data;
        const message = messages.find(m => m.id === messageId && !m.isGroup);
        if (!message || message.from !== from) return;

        message.text = newText || '';
        message.isEdited = true;
        message.editedAt = Date.now();

        const recipientSocketId = onlineUsers.get(to);
        const payload = { messageId, newText: message.text, editedAt: message.editedAt };

        socket.emit('message-edited', payload);
        if (recipientSocketId) io.to(recipientSocketId).emit('message-edited', payload);

        updateChatList(from, to, message);
        updateChatList(to, from, message);

        saveData();
    });

    // REACT TO DIRECT MESSAGE
    socket.on('react-message', (data) => {
        const { messageId, from, to, reaction } = data;
        const message = messages.find(m => m.id === messageId && !m.isGroup);
        if (!message) return;

        if (!Array.isArray(message.reactions)) message.reactions = [];

        const existingIndex = message.reactions.findIndex(r => r.user === from);
        if (existingIndex !== -1) {
            if (message.reactions[existingIndex].reaction === reaction) {
                message.reactions.splice(existingIndex, 1);
            } else {
                message.reactions[existingIndex].reaction = reaction;
            }
        } else {
            message.reactions.push({ user: from, reaction });
        }

        const recipientSocketId = onlineUsers.get(to);
        const payload = { messageId, reactions: message.reactions };

        socket.emit('message-reacted', payload);
        if (recipientSocketId) io.to(recipientSocketId).emit('message-reacted', payload);

        saveData();
    });

    // UNSEND DIRECT MESSAGE
    socket.on('unsend-message', (data) => {
        const { messageId, from, to } = data;
        const message = messages.find(m => m.id === messageId && !m.isGroup);
        if (!message || message.from !== from) return;

        message.isUnsent = true;
        message.text = 'This message was unsent';
        message.unsentAt = Date.now();

        const payload = { messageId, text: message.text };

        socket.emit('message-unsent', payload);
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) io.to(recipientSocketId).emit('message-unsent', payload);

        updateChatList(from, to, message);
        updateChatList(to, from, message);

        saveData();
    });

    // CLEAR CHAT (DIRECT) — client handles undo with restored messages
    socket.on('clear-chat', (data) => {
        const { username, chatUser } = data;

        const chatMessages = messages.filter(msg =>
            !msg.isGroup && (
                (msg.from === username && msg.to === chatUser) ||
                (msg.from === chatUser && msg.to === username)
            )
        );

        socket.emit('chat-cleared', {
            chatUser,
            clearedMessages: chatMessages,
            timestamp: Date.now()
        });

        const userChatList = chatLists[username] || [];
        const chatIndex = userChatList.findIndex(c => c.username === chatUser);
        if (chatIndex !== -1) {
            userChatList[chatIndex].lastMessage = 'No messages yet';
            userChatList[chatIndex].lastMessageTime = Date.now();
            userChatList[chatIndex].unreadCount = 0;
        }

        saveData();
    });

    // RESTORE CHAT (direct) from client's cache
    socket.on('restore-chat', (data) => {
        const { username, chatUser, clearedMessages } = data;

        socket.emit('chat-restored', { chatUser, messages: clearedMessages });

        if (clearedMessages && clearedMessages.length > 0) {
            const last = clearedMessages[clearedMessages.length - 1];
            updateChatList(username, chatUser, last);
        }

        saveData();
    });

    // TYPING (DIRECT)
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

    // ========== GROUPS ==========

    // Create group
    socket.on('create-group', (data) => {
        const { name, members, createdBy } = data;
        if (!name || !createdBy || !Array.isArray(members) || members.length === 0) return;

        const id = generateGroupId();
        const uniqueMembers = Array.from(new Set([...members, createdBy]));

        const group = {
            id,
            name,
            members: uniqueMembers,
            createdBy,
            createdAt: Date.now()
        };

        groups.push(group);
        saveData();

        // Notify members who are online
        uniqueMembers.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) {
                io.to(sid).emit('group-created', group);
            }
        });
    });

    // Send group message
    socket.on('send-group-message', (data) => {
        const {
            from,
            groupId,
            text,
            messageId,
            type = 'text',
            fileUrl = null,
            fileName = null,
            mimeType = null,
            duration = null
        } = data;

        const group = groups.find(g => g.id === groupId);
        if (!group || !group.members.includes(from)) return;

        const message = {
            id: messageId,
            from,
            to: null,
            text: text || '',
            timestamp: Date.now(),
            chatId: groupId,
            status: 'sent',
            isUnsent: false,
            isEdited: false,
            editedAt: null,
            reactions: [],
            isGroup: true,
            groupId,
            type,
            fileUrl,
            fileName,
            mimeType,
            duration
        };

        messages.push(message);

        // Broadcast to all group members
        group.members.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) {
                io.to(sid).emit('new-group-message', message);
            }
        });

        saveData();
    });

    // Edit group message
    socket.on('edit-group-message', (data) => {
        const { messageId, from, groupId, newText } = data;
        const message = messages.find(m => m.id === messageId && m.isGroup && m.groupId === groupId);
        if (!message || message.from !== from) return;

        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        message.text = newText || '';
        message.isEdited = true;
        message.editedAt = Date.now();

        const payload = { messageId, newText: message.text, editedAt: message.editedAt, groupId };
        group.members.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('group-message-edited', payload);
        });

        saveData();
    });

    // React to group message
    socket.on('react-group-message', (data) => {
        const { messageId, from, groupId, reaction } = data;
        const message = messages.find(m => m.id === messageId && m.isGroup && m.groupId === groupId);
        if (!message) return;

        if (!Array.isArray(message.reactions)) message.reactions = [];

        const existingIndex = message.reactions.findIndex(r => r.user === from);
        if (existingIndex !== -1) {
            if (message.reactions[existingIndex].reaction === reaction) {
                message.reactions.splice(existingIndex, 1);
            } else {
                message.reactions[existingIndex].reaction = reaction;
            }
        } else {
            message.reactions.push({ user: from, reaction });
        }

        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        const payload = { messageId, reactions: message.reactions, groupId };
        group.members.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('group-message-reacted', payload);
        });

        saveData();
    });

    // Unsend group message
    socket.on('unsend-group-message', (data) => {
        const { messageId, from, groupId } = data;
        const message = messages.find(m => m.id === messageId && m.isGroup && m.groupId === groupId);
        if (!message || message.from !== from) return;

        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        message.isUnsent = true;
        message.text = 'This message was unsent';
        message.unsentAt = Date.now();

        const payload = { messageId, text: message.text, groupId };
        group.members.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('group-message-unsent', payload);
        });

        saveData();
    });

    // Typing in group
    socket.on('group-typing-start', (data) => {
        const { from, groupId } = data;
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        group.members.forEach(member => {
            if (member === from) return;
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('group-typing', { groupId, username: from, isTyping: true });
        });
    });

    socket.on('group-typing-stop', (data) => {
        const { from, groupId } = data;
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        group.members.forEach(member => {
            if (member === from) return;
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('group-typing', { groupId, username: from, isTyping: false });
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);

            const user = users.find(u => u.username === socket.username);
            if (user) user.lastSeen = Date.now();

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

// Update direct chat list for username about otherUser
function updateChatList(username, otherUser, message) {
    if (!chatLists[username]) chatLists[username] = [];

    const list = chatLists[username];
    let chat = list.find(c => c.username === otherUser);

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
        list.push(chat);
    }

    // Show text or file indicator
    if (message.type === 'text') {
        chat.lastMessage = message.text;
    } else if (message.type === 'image') {
        chat.lastMessage = '📷 Image';
    } else if (message.type === 'file') {
        chat.lastMessage = `📎 ${message.fileName || 'File'}`;
    } else if (message.type === 'audio') {
        chat.lastMessage = '🎤 Voice message';
    } else {
        chat.lastMessage = message.text || 'New message';
    }

    chat.lastMessageTime = message.timestamp;

    if (message.from !== username) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
}

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;

loadData().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📱 Chat app: http://localhost:${PORT}`);
        console.log(`👥 ${users.length} users, 💬 ${messages.length} messages, 👥‍👥 ${groups.length} groups`);
    });
});

// Graceful shutdown
async function gracefulShutdown() {
    console.log('\n🛑 Shutting down server...');
    await saveData();
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
