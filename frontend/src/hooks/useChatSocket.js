import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export const useChatSocket = (chatId, user) => {
    const [isConnected, setIsConnected] = useState(false);
    const [signalQueue, setSignalQueue] = useState([]); // Use Queue instead of single value
    const ws = useRef(null);
    const queryClient = useQueryClient();

    // Helper to clear processed signals
    const popSignal = () => {
        setSignalQueue(prev => prev.slice(1));
    };

    useEffect(() => {
        if (!user || !chatId) return;

        // Connect to WebSocket Server
        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';
        const socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onopen = () => {
            console.log('WebSocket Connected');
            setIsConnected(true);

            // Authenticate
            socket.send(JSON.stringify({
                type: 'AUTH',
                payload: { token: user.token }
            }));
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'AUTH_SUCCESS') {
                // Join Room
                socket.send(JSON.stringify({
                    type: 'JOIN_ROOM',
                    payload: { chatId }
                }));
            } else if (data.type === 'NEW_MESSAGE') {
                const message = data.payload;
                // Tanstack optimistic updates
                queryClient.setQueryData(['messages', chatId], (oldData) => {
                    if (!oldData) return [message];
                    if (oldData.some(m => m._id === message._id)) return oldData;
                    return [message, ...oldData];
                });
            } else if (['VIDEO_OFFER', 'VIDEO_ANSWER', 'ICE_CANDIDATE', 'JOIN_CALL', 'VIDEO_CALL_ENDED'].includes(data.type)) {
                // Append to queue
                setSignalQueue(prev => [...prev, { type: data.type, payload: data.payload }]);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket Disconnected');
            setIsConnected(false);
        };

        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, [chatId, user, queryClient]);

    const sendMessage = (content) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'NEW_MESSAGE',
                payload: { chatId, content }
            }));
        } else {
            console.warn("Socket not connected");
        }
    };

    const sendSignal = (type, payload) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type,
                payload: { chatId, ...payload }
            }));
        }
    };

    return { isConnected, sendMessage, sendSignal, signalQueue, popSignal };
};
