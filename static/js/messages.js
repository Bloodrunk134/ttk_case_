// Управление историей сообщений пользователя
class UserMessages {
    constructor() {
        this.currentPage = 1;
        this.limit = 10;
        this.totalMessages = 0;
        this.messagesList = document.getElementById('messagesList');
        this.paginationDiv = document.getElementById('messagesPagination');
        this.refreshBtn = document.getElementById('refreshMessagesBtn');
        
        this.init();
    }
    
    init() {
        if (this.messagesList) {
            this.loadMessages();
            
            if (this.refreshBtn) {
                this.refreshBtn.addEventListener('click', () => {
                    this.loadMessages(1);
                });
            }
            
            // Автообновление каждые 30 секунд
            setInterval(() => {
                if (Utils.getCurrentUser()) {
                    this.loadMessages(this.currentPage, true);
                }
            }, 30000);
        }
    }
    
    async loadMessages(page = 1, silent = false) {
        if (!Utils.getCurrentUser()) {
            this.messagesList.innerHTML = '<p style="text-align: center; color: #999;">Войдите в систему, чтобы видеть сообщения</p>';
            return;
        }
        
        if (!silent) {
            this.messagesList.innerHTML = '<p style="text-align: center; color: #999;">Загрузка сообщений...</p>';
        }
        
        try {
            const offset = (page - 1) * this.limit;
            // Используем мок-данные для демонстрации
            const messages = this.getMockMessages();
            
            this.totalMessages = messages.length;
            this.currentPage = page;
            
            const start = offset;
            const end = offset + this.limit;
            const pageMessages = messages.slice(start, end);
            
            this.renderMessages(pageMessages);
            this.renderPagination();
        } catch (error) {
            console.error('Failed to load messages:', error);
            if (!silent) {
                this.messagesList.innerHTML = '<p style="text-align: center; color: #dc3545;">Ошибка загрузки сообщений</p>';
            }
        }
    }
    
    getMockMessages() {
        // Мок-данные для демонстрации
        const currentUser = Utils.getCurrentUser();
        if (!currentUser) return [];
        
        // Загружаем сохраненные сообщения из localStorage
        const storedMessages = localStorage.getItem(`user_messages_${currentUser.id}`);
        if (storedMessages) {
            return JSON.parse(storedMessages);
        }
        
        // Тестовые сообщения для демонстрации
        const mockMessages = [
            {
                id: 1,
                user_id: currentUser.id,
                user_login: currentUser.login,
                text: 'Привет, ведущий! Какой трек сейчас играет?',
                type: 'text',
                status: 'completed',
                response_text: 'Сейчас играет новый трек группы Imagine Dragons!',
                created_at: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 2,
                user_id: currentUser.id,
                user_login: currentUser.login,
                text: 'Можете поставить песню "Море" от группы "Звери"?',
                type: 'text',
                status: 'in_progress',
                response_text: null,
                created_at: new Date(Date.now() - 7200000).toISOString()
            },
            {
                id: 3,
                user_id: currentUser.id,
                user_login: currentUser.login,
                text: 'Отличный эфир сегодня!',
                type: 'text',
                status: 'new',
                response_text: null,
                created_at: new Date(Date.now() - 1800000).toISOString()
            }
        ];
        
        localStorage.setItem(`user_messages_${currentUser.id}`, JSON.stringify(mockMessages));
        return mockMessages;
    }
    
    renderMessages(messages) {
        if (!messages || messages.length === 0) {
            this.messagesList.innerHTML = '<p style="text-align: center; color: #999;">У вас пока нет сообщений</p>';
            return;
        }
        
        this.messagesList.innerHTML = messages.map(msg => this.renderMessageCard(msg)).join('');
        
        // Добавляем обработчики для кнопок удаления
        document.querySelectorAll('.delete-message-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = parseInt(btn.dataset.messageId);
                this.deleteMessage(messageId);
            });
        });
    }
    
    renderMessageCard(message) {
        const statusConfig = {
            'new': { text: '🆕 Новое', color: '#007bff' },
            'in_progress': { text: '⏳ В работе', color: '#ffc107' },
            'completed': { text: '✅ Завершено', color: '#28a745' }
        };
        
        const status = statusConfig[message.status] || { text: message.status, color: '#6c757d' };
        const date = new Date(message.created_at).toLocaleString('ru-RU');
        const messageType = message.type === 'voice' ? '🎙 Голосовое' : '💬 Текстовое';
        
        // Можно удалить только сообщения со статусом "новое"
        const canDelete = message.status === 'new';
        
        return `
            <div class="message-card">
                <div class="message-header">
                    <div>
                        <span class="message-type">${messageType}</span>
                        <span class="message-status" style="background: ${status.color};">${status.text}</span>
                    </div>
                    <span class="message-date">${date}</span>
                </div>
                
                <div class="message-content">
                    ${message.type === 'voice' 
                        ? `<audio controls style="width: 100%;">
                            <source src="${message.voice_url || ''}" type="audio/wav">
                            Ваш браузер не поддерживает аудио
                           </audio>`
                        : `<p style="margin: 0;">${this.escapeHtml(message.text)}</p>`
                    }
                </div>
                
                ${message.response_text ? `
                    <div class="message-response">
                        <strong>📢 Ответ ведущего:</strong>
                        <p style="margin: 5px 0 0 0;">${this.escapeHtml(message.response_text)}</p>
                    </div>
                ` : ''}
                
                ${canDelete ? `
                    <div class="message-actions">
                        <button class="delete-message-btn" data-message-id="${message.id}">
                            🗑 Удалить
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    renderPagination() {
        if (!this.paginationDiv) return;
        
        const totalPages = Math.ceil(this.totalMessages / this.limit);
        
        if (totalPages <= 1) {
            this.paginationDiv.innerHTML = '';
            return;
        }
        
        let paginationHtml = '';
        
        // Кнопка "Назад"
        if (this.currentPage > 1) {
            paginationHtml += `<button onclick="window.userMessages.goToPage(${this.currentPage - 1})" 
                               style="padding: 5px 10px; cursor: pointer;">← Назад</button>`;
        }
        
        // Номера страниц
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            paginationHtml += `<button onclick="window.userMessages.goToPage(${i})" 
                               style="padding: 5px 10px; cursor: pointer; ${isActive ? 'background: #007bff; color: white;' : ''}">
                               ${i}</button>`;
        }
        
        // Кнопка "Вперед"
        if (this.currentPage < totalPages) {
            paginationHtml += `<button onclick="window.userMessages.goToPage(${this.currentPage + 1})" 
                               style="padding: 5px 10px; cursor: pointer;">Вперед →</button>`;
        }
        
        this.paginationDiv.innerHTML = paginationHtml;
    }
    
    async deleteMessage(messageId) {
        if (!confirm('Вы уверены, что хотите удалить это сообщение?')) return;
        
        try {
            const currentUser = Utils.getCurrentUser();
            const storedMessages = localStorage.getItem(`user_messages_${currentUser.id}`);
            let messages = storedMessages ? JSON.parse(storedMessages) : [];
            
            messages = messages.filter(msg => msg.id !== messageId);
            localStorage.setItem(`user_messages_${currentUser.id}`, JSON.stringify(messages));
            
            Utils.showNotification('Сообщение удалено', 'success');
            this.loadMessages(this.currentPage);
        } catch (error) {
            Utils.showNotification('Нельзя удалить обработанное сообщение', 'error');
        }
    }
    
    goToPage(page) {
        this.loadMessages(page);
    }
    
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Глобальная переменная
let userMessages;