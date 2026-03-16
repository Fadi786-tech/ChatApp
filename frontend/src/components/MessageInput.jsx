import React, { useState } from 'react';
import { SendHorizontal } from 'lucide-react';

const MessageInput = ({ onSendMessage }) => {
    const [text, setText] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSendMessage(text);
        setText('');
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <input
                type="text"
                className="flex-1 bg-slate-100 border border-slate-200 rounded-full px-6 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all duration-200 placeholder:text-slate-400 text-slate-700"
                placeholder="Type your message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <button
                type="submit"
                className="p-3.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-95 flex-shrink-0"
                disabled={!text.trim()}
            >
                <SendHorizontal size={20} className="ml-0.5" />
            </button>
        </form>
    );
};

export default MessageInput;
