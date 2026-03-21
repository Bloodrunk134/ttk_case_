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
            
            // Пытаемся получить тело ответа
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            if (response.status === 401) {
                this.logout();
                throw new Error('Сессия истекла');
            }
            
            // Обработка ошибок валидации (422)
            if (response.status === 422) {
                let errorMessage = 'Ошибка валидации данных';
                if (data && data.detail) {
                    if (Array.isArray(data.detail)) {
                        // Форматируем ошибки Pydantic
                        errorMessage = data.detail.map(err => {
                            const field = err.loc?.join('.') || 'поле';
                            return `${field}: ${err.msg}`;
                        }).join('; ');
                    } else {
                        errorMessage = data.detail;
                    }
                }
                throw new Error(errorMessage);
            }
            
            if (!response.ok) {
                const errorMsg = data && data.detail ? data.detail : `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(errorMsg);
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
                password_confirm: userData.password_confirm || userData.password
            })
        });
    },
    
    async login(login, password) {
        const response = await fetch(`${this.baseURL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        if (!response.ok) {
            const errorMsg = data && data.detail ? data.detail : 'Неверный логин или пароль';
            throw new Error(errorMsg);
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
    
    async getMediaFiles() {
        return await this.request('/broadcaster/media');
    },
    
    async uploadMedia(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${this.baseURL}/broadcaster/media/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch(e) {
                errorData = { detail: 'Ошибка загрузки файла' };
            }
            throw new Error(errorData.detail || 'Ошибка загрузки');
        }
        
        return await response.json();
    },
    
    async getPlaylists() {
        return await this.request('/broadcaster/playlists');
    },
    
    async createPlaylist(playlistData) {
        return await this.request('/broadcaster/playlists', {
            method: 'POST',
            body: JSON.stringify(playlistData)
        });
    },
    
    async getPlaylistItems(playlistId) {
        return await this.request(`/broadcaster/playlists/${playlistId}/items`);
    },
    
    async addPlaylistItem(playlistId, mediaId) {
        return await this.request(`/broadcaster/playlists/${playlistId}/items`, {
            method: 'POST',
            body: JSON.stringify({ media_id: mediaId })
        });
    },
    
    async updateMessageStatus(messageId, status, responseText = null) {
        const body = { status };
        if (responseText) {
            body.response_text = responseText;
        }
        return await this.request(`/messages/${messageId}/status`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }
};