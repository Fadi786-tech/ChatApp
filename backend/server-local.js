const dotenv = require('dotenv');
dotenv.config();
const http = require('http');
const WebSocket = require('ws');
const app = require('./server'); // Import the main app

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- WebSocket Server (for local development only) ---

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
                        const jwt = require('jsonwebtoken');
                        const decoded = jwt.verify(payload.token, process.env.JWT_SECRET || 'secret789');
                        ws.user = decoded;
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { userId: decoded.userId } }));

                        // Mark user online in DB
                        const User = require('./models/User');
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
                    const Message = require('./models/Message');
                    const Chat = require('./models/Chat');
                    
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
            const User = require('./models/User');
            await User.findByIdAndUpdate(ws.user.userId, { status: 'offline', lastActive: new Date() });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Server v2 (Multi-User Support) Started'); // Marker log
});