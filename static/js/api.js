const API = {
    baseURL: '/api',
    token: localStorage.getItem('accessToken'),
    
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                this.logout();
                throw new Error('Сессия истекла');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || 'Ошибка запроса');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    async register(userData) {
        return await this.request('/register', {
            method: 'POST',
            body: JSON.stringify({
                login: userData.login,
                full_name: userData.fullname,
                password: userData.password,
                password_confirm: userData.password
            })
        });
    },
    
    async login(login, password) {
        const response = await fetch(`${this.baseURL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка авторизации');
        }
        
        this.token = data.access_token;
        localStorage.setItem('accessToken', this.token);
        
        const user = await this.getCurrentUser();
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        return user;
    },
    
    logout() {
        this.token = null;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser');
        window.location.href = '/login.html';
    },
    
    async getCurrentUser() {
        return await this.request('/me');
    },
    
    async sendMessage(messageData) {
        return await this.request('/messages', {
            method: 'POST',
            body: JSON.stringify({ text: messageData.text })
        });
    },
    
    async getMessages() {
        return await this.request('/messages');
    },
    
    async getAllUsers() {
        return await this.request('/admin/users');
    },
    
    async updateMessageStatus(messageId, status) {
        return await this.request(`/messages/${messageId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    },
    
    async sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        
        const response = await fetch(`${this.baseURL}/voice-messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка отправки');
        }
        
        return await response.json();
    }
};
