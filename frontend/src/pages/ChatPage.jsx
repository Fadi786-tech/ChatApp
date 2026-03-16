import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMessages, createChat } from '../api/api';
import { useChatSocket } from '../hooks/useChatSocket';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import VideoCall from '../components/VideoCall';
import LoginPage from './LoginPage';
import { LogOut, MessagesSquare } from 'lucide-react';

const ChatPage = () => {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('chatAppUser');
        return saved ? JSON.parse(saved) : null;
    });

    // user ko localStorage mein store karana
    React.useEffect(() => {
        if (user) {
            localStorage.setItem('chatAppUser', JSON.stringify(user));
        } else {
            localStorage.removeItem('chatAppUser');
        }
    }, [user]);

    const [activeChatId, setActiveChatId] = useState(null);

    // messages ko TanStack Query se fetch karna
    const { data: messages = [], isLoading } = useQuery({
        queryKey: ['messages', activeChatId],
        queryFn: () => fetchMessages(activeChatId),
        enabled: !!activeChatId,
        refetchOnWindowFocus: false, // Rely on WS updates
    });

    // WebSocket se messages receive karna
    const { sendMessage, sendSignal, signalQueue, popSignal, isConnected } = useChatSocket(activeChatId, user);

    // Video Call State
    const [inCall, setInCall] = useState(false);
    const [isCaller, setIsCaller] = useState(false);
    const [incomingCall, setIncomingCall] = useState(false);

    // Watch for incoming calls & signals (Queue based)
    React.useEffect(() => {
        if (signalQueue.length === 0) return;

        const currentSignal = signalQueue[0];
        const { type } = currentSignal;

        if ((type === 'VIDEO_OFFER' || type === 'JOIN_CALL') && !inCall) {
            setIncomingCall(true);
            popSignal(); // We consumed this signal here
        }
        else if (type === 'VIDEO_CALL_ENDED') {
            setInCall(false);
            setIncomingCall(false);
            setIsCaller(false);
            popSignal(); // We consumed this signal here
        }
        // Messages like ICE_CANDIDATE/OFFER/ANSWER are for VideoCall component, 
        // so we don't pop them here if we are inCall. 
        // But if we are NOT inCall, we should probably ignore/pop them to keep queue clean?
        // Actually, if we are inCall, we pass the queue to VideoCall component.
        else if (!inCall) {
            // Ignore signals if not in call or setting up?
            // Wait, if it's an OFFER but we are not inCall, we processed it above.
            // If it's a CANDIDATE but not inCall, assume it's garbage or late.
            popSignal();
        }

    }, [signalQueue, inCall, popSignal]);

    const startCall = () => {
        setIsCaller(true);
        setInCall(true);
    };

    const acceptCall = () => {
        setIncomingCall(false);
        setIsCaller(false);
        setInCall(true);
    };

    const rejectCall = () => {
        setIncomingCall(false);
        // Requirement: Disconnect from all others if declined
        sendSignal('VIDEO_CALL_ENDED', { chatId: activeChatId });
    };

    const endCall = () => {
        setInCall(false);
        setIsCaller(false);
        // Optional: reload or cleanup
    };

    // demo chat start karna
    const handleStartDemoChat = async () => {
        try {
            const chat = await createChat([user.user._id], "General Chat", true);
            setActiveChatId(chat._id);
        } catch (e) {
            alert("Error creating chat");
        }
    };

    if (!user) {
        return <LoginPage onLogin={setUser} />;
    }

    return (
        <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Sidebar (Premium Dark) */}
            <div className="w-80 bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col shadow-2xl z-10">
                <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold text-xl shadow-lg ring-2 ring-slate-800">
                            {user.user.username[0].toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-white tracking-tight">{user.user.username}</h3>
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <p className="text-xs text-emerald-400 font-medium">Online</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Conversations</div>
                    {/* Demo: List of chats show karna. For now, just a button to join 'General' */}
                    <button
                        onClick={handleStartDemoChat}
                        className={`w-full text-left p-4 rounded-xl flex items-center gap-3 transition-all duration-200 group ${activeChatId
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/50'
                                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
                            }`}
                    >
                        <div className={`p-2 rounded-lg ${activeChatId ? 'bg-white/20' : 'bg-slate-800 group-hover:bg-slate-700'} transition-colors`}>
                            <MessagesSquare size={20} />
                        </div>
                        <div className="flex-1">
                            <span className="font-medium">General Chat</span>
                            {!activeChatId && <p className="text-xs text-slate-500 mt-1">Click to join discussion</p>}
                        </div>
                    </button>
                    {/* Placeholder for more chats */}
                </div>

                <div className="p-5 border-t border-slate-800 bg-slate-900">
                    <button
                        onClick={() => setUser(null)}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 text-sm font-medium"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-slate-50 relative">
                {activeChatId ? (
                    <>
                        {/* Header */}
                        <div className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-8 justify-between shadow-sm sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                    <MessagesSquare size={20} />
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-900 text-lg">General Chat</h2>
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                        <span className={`${isConnected ? 'text-emerald-600' : 'text-rose-600'} font-medium`}>
                                            {isConnected ? 'Connected' : 'Disconnected'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={startCall}
                                className="p-3 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200 hover:shadow-md active:scale-95"
                                title="Start Video Call"
                            >
                                <svg xmlns="www.w3.org" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                            </button>
                        </div>

                        {/* Messages */}
                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">
                                Loading conversation...
                            </div>
                        ) : (
                            <MessageList messages={messages} currentUserId={user.user._id} />
                        )}

                        {/* Input */}
                        <div className="bg-white p-6 border-t border-slate-200">
                            <MessageInput onSendMessage={sendMessage} />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center flex-col text-slate-400 bg-slate-50/50">
                        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                            <MessagesSquare size={40} className="text-slate-300" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-700 mb-2">Welcome to ChatApp</h3>
                        <p className="max-w-md text-center text-slate-500">Select a conversation from the sidebar to start messaging.</p>
                    </div>
                )}
            </div>


            {/* Incoming Call Modal */}
            {
                incomingCall && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="bg-white p-8 rounded-2xl shadow-2xl border-0 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-6 relative">
                                <span className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-75"></span>
                                <svg xmlns="www.w3.org" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8 relative z-10">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                            </div>

                            <h3 className="font-bold text-2xl text-slate-800 mb-1">Incoming Call</h3>
                            <p className="text-slate-500 mb-8 text-center">Someone started a video call with you</p>

                            <div className="flex w-full gap-3">
                                <button
                                    onClick={rejectCall}
                                    className="flex-1 py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-semibold transition-colors duration-200"
                                >
                                    Decline
                                </button>
                                <button
                                    onClick={acceptCall}
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/20 transition-all duration-200"
                                >
                                    Accept
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* In-Call Interface */}
            {
                inCall && (
                    <VideoCall
                        chatId={activeChatId}
                        userId={user.user._id}
                        sendSignal={sendSignal}
                        signalQueue={signalQueue}
                        popSignal={popSignal}
                        onClose={endCall}
                        isCaller={isCaller}
                    />
                )
            }
        </div >
    );
};

export default ChatPage;
