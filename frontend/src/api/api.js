import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Debug: Log the API URL being used
console.log('API Base URL:', import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

// Response interceptor to handle errors widely if needed
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);

export const loginUser = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
};

export const createChat = async (participantIds, name, isGroup) => {
    const response = await api.post('/chats', { participantIds, name, isGroup });
    return response.data;
};

export const fetchMessages = async (chatId) => {
    const response = await api.get(`/chats/${chatId}/messages`);
    return response.data;
};

export default api;
