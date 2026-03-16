const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');

const app = express();

// CORS configuration for Vercel
app.use(cors({
    origin: true, // Allow all origins for now to debug
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// MongoDB Connection
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    
    try {
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
};

// Health check endpoint
app.get('/', async (req, res) => {
    try {
        await connectDB();
        res.json({ 
            status: 'Server is running', 
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            mongodb: isConnected ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'Server error', 
            error: error.message,
            mongodb: 'connection failed'
        });
    }
});

// Health check for API
app.get('/api', async (req, res) => {
    try {
        await connectDB();
        res.json({ 
            status: 'API is running', 
            timestamp: new Date().toISOString(),
            endpoints: ['/api/auth/login', '/api/chats', '/api/chats/:chatId/messages'],
            mongodb: isConnected ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'API error', 
            error: error.message 
        });
    }
});

// --- HTTP Endpoints ---

// Login or Register
app.post('/api/auth/login', async (req, res) => {
    try {
        await connectDB();
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        let user = await User.findOne({ email });

        // Create user if doesn't exist (demo feature)
        if (!user) {
            const passwordHash = await bcrypt.hash(password, 10);
            user = new User({
                username: email.split('@')[0],
                email,
                passwordHash,
                avatarUrl: `https://ui-avatars.com/api/?name=${email.substring(0, 2)}`
            });
            await user.save();
            console.log('New user created:', email);
        } else {
            const match = await bcrypt.compare(password, user.passwordHash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update status
        user.status = 'online';
        await user.save();

        const token = jwt.sign(
            { userId: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'fallback-secret', 
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        res.json({ token, user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Create Chat (Helper)
app.post('/api/chats', async (req, res) => {
    try {
        await connectDB();
        
        const { participantIds, name, isGroup } = req.body;

        // Check if group chat exists and update participants
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
        res.status(500).json({ error: 'Failed to create chat: ' + error.message });
    }
});

// Get Messages
app.get('/api/chats/:chatId/messages', async (req, res) => {
    try {
        await connectDB();
        
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
        res.status(500).json({ error: 'Failed to fetch messages: ' + error.message });
    }
});

// Export for Vercel
module.exports = app;
