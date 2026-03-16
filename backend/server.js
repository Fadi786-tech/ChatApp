const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true) // Allow all origins if FRONTEND_URL not set
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Server is running', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Health check for API
app.get('/api', (req, res) => {
    res.json({ 
        status: 'API is running', 
        timestamp: new Date().toISOString(),
        endpoints: ['/api/auth/login', '/api/chats', '/api/chats/:chatId/messages']
    });
});

// --- HTTP Endpoints ---

// Login or Register
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let user = await User.findOne({ email });

        // ye demo k liye is liye agr user exist nahi karta toh ye unhi credentials se aik user create kr dega aur login kr dega
        if (!user) {
            const passwordHash = await bcrypt.hash(password, 10);
            user = new User({
                username: email.split('@')[0],
                email,
                passwordHash,
                avatarUrl: `https://ui-avatars.com/api/?name=${email.substring(0, 2)}`
            });
            await user.save();
        } else {
            const match = await bcrypt.compare(password, user.passwordHash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update status
        user.status = 'online';
        await user.save();

        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        res.json({ token, user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Chat (Helper)
app.post('/api/chats', async (req, res) => {
    try {
        const { participantIds, name, isGroup } = req.body;

        // ye kary ga k group chat exist krti ha ya nahi agr exist krti hai toh naye participants add kr k update karta ha
        if (isGroup && name) {
            let chat = await Chat.findOne({ name, isGroup: true });
            if (chat) {
                // Add participants if missing
                const newParticipants = participantIds.filter(id => !chat.participants.includes(id));
                if (newParticipants.length > 0) {
                    chat.participants.push(...newParticipants);
                    await chat.save();
                }
                return res.json(chat);
            }
        }

        const chat = new Chat({
            name,
            isGroup: !!isGroup,
            participants: participantIds
        });

        await chat.save();
        res.json(chat);
    } catch (error) {
        console.error('Create Chat error:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

// Get Messages
app.get('/api/chats/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, before } = req.query;

        // Check if chatId is valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ error: 'Invalid Chat ID' });
        }

        const query = { chatId };
        if (before) {
            query.timestamp = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .populate('senderId', 'username avatarUrl');

        res.json(messages);
    } catch (error) {
        console.error('Get Messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// --- WebSocket Server ---

// Map: ChatID -> Set of WebSocket clients
const rooms = new Map();

function broadcastToRoom(chatId, data) {
    const clients = rooms.get(chatId.toString());
    if (clients) {
        const messageStr = JSON.stringify(data);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.user = null; // Authenticated user

    ws.on('message', async (messageRaw) => {
        try {
            const messageData = JSON.parse(messageRaw);
            const { type, payload } = messageData;

            switch (type) {
                case 'AUTH':
                    try {
                        const decoded = jwt.verify(payload.token, process.env.JWT_SECRET || 'secret789');
                        ws.user = decoded;
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { userId: decoded.userId } }));

                        // Mark user online in DB
                        await User.findByIdAndUpdate(decoded.userId, { status: 'online' });
                    } catch (err) {
                        ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Invalid Token' }));
                        ws.close();
                    }
                    break;

                case 'JOIN_ROOM':
                    if (!ws.user) return; // Must be auth
                    const { chatId } = payload;
                    if (!rooms.has(chatId)) {
                        rooms.set(chatId, new Set());
                    }
                    rooms.get(chatId).add(ws);
                    ws.currentChatId = chatId;
                    break;

                case 'LEAVE_ROOM':
                    if (ws.currentChatId && rooms.has(ws.currentChatId)) {
                        rooms.get(ws.currentChatId).delete(ws);
                    }
                    break;

                case 'NEW_MESSAGE':
                    if (!ws.user) return;
                    const { chatId: msgChatId, content } = payload;

                    // Save to DB
                    const newMessage = new Message({
                        chatId: msgChatId,
                        senderId: ws.user.userId,
                        content,
                        timestamp: new Date()
                    });
                    const savedMsg = await newMessage.save();
                    // Populate sender info for clients
                    await savedMsg.populate('senderId', 'username avatarUrl');

                    // Update Chat
                    await Chat.findByIdAndUpdate(msgChatId, {
                        lastMessage: savedMsg._id,
                        updatedAt: savedMsg.timestamp
                    });

                    // Broadcast
                    broadcastToRoom(msgChatId, {
                        type: 'NEW_MESSAGE',
                        payload: savedMsg
                    });
                    break;

                // --- WebRTC Signaling ---
                case 'JOIN_CALL':
                case 'VIDEO_OFFER':
                case 'VIDEO_ANSWER':
                case 'ICE_CANDIDATE':
                case 'VIDEO_CALL_ENDED':
                    if (!ws.user) return;
                    const { chatId: signalChatId, ...signalData } = payload;
                    // Broadcast to others in the room
                    const roomClients = rooms.get(signalChatId);
                    if (roomClients) {
                        roomClients.forEach(client => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: type, // Preserves VIDEO_OFFER, etc.
                                    payload: {
                                        ...signalData,
                                        senderId: ws.user.userId
                                    }
                                }));
                            }
                        });
                    }
                    else {
                        // console.log("No room clients found for chat", signalChatId);
                    }
                    break;

                default:
                    console.warn('Unknown message type:', type);
            }
        } catch (err) {
            console.error('WS Error:', err);
        }
    });

    ws.on('close', async () => {
        if (ws.currentChatId && rooms.has(ws.currentChatId)) {
            // If user disconnects (closes tab), ensure call ends for others in room
            broadcastToRoom(ws.currentChatId, {
                type: 'VIDEO_CALL_ENDED',
                payload: { chatId: ws.currentChatId }
            });

            rooms.get(ws.currentChatId).delete(ws);
        }
        if (ws.user) {
            // Mark offline
            await User.findByIdAndUpdate(ws.user.userId, { status: 'offline', lastActive: new Date() });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Server v2 (Multi-User Support) Started'); // Marker log
});
