import React, { useLayoutEffect, useRef } from 'react';
import classNames from 'classnames';

const MessageList = ({ messages, currentUserId }) => {
    const bottomRef = useRef(null);

    useLayoutEffect(() => {
        // Scroll the anchor div into view whenever messages change
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50 custom-scrollbar">
            <div className="flex flex-col gap-2 min-h-full justify-end pb-4">
                {[...messages].reverse().map((msg, index) => {
                    const isMe = msg.senderId._id === currentUserId || msg.senderId === currentUserId;
                    // Handle population. API returns populated senderId usually.
                    const senderName = msg.senderId.username || 'Unknown';
                    const avatarUrl = msg.senderId.avatarUrl;

                    // Check if previous message was from same user (to group bubbles)
                    // Note: 'messages' is reversed in the map, but original array is chronological? 
                    // Wait, [...messages].reverse() means index 0 is the NEWEST message. 
                    // Visual grouping usually depends on chronological order. 
                    // Let's assume standard intuitive list: top is old, bottom is new.
                    // The Map iterates reversed... so index 0 is newest.

                    return (
                        <div
                            key={msg._id}
                            className={classNames('flex items-end gap-3 max-w-[85%] md:max-w-[70%] group', {
                                'self-end flex-row-reverse': isMe,
                                'self-start': !isMe,
                            })}
                        >
                            {!isMe && (
                                <div className="flex-shrink-0">
                                    {/* Avatar only if needed, or always? Let's design nicer avatars */}
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-600 shadow-sm">
                                        {senderName[0].toUpperCase()}
                                    </div>
                                </div>
                            )}

                            <div
                                className={classNames('relative p-4 shadow-sm text-sm break-words transition-all duration-200 hover:shadow-md', {
                                    'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl rounded-tr-sm': isMe,
                                    'bg-white text-slate-700 border border-slate-100 rounded-2xl rounded-tl-sm': !isMe,
                                })}
                            >
                                {!isMe && <p className="text-[10px] text-slate-400 mb-1 font-bold tracking-wide uppercase">{senderName}</p>}
                                <p className="leading-relaxed text-[15px]">{msg.content}</p>
                                <div className={classNames('text-[10px] mt-1.5 opacity-80 text-right select-none', {
                                    'text-indigo-100': isMe,
                                    'text-slate-400': !isMe
                                })}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} className="h-1" />
            </div>
        </div>
    );
};

export default MessageList;
