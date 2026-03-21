// Управление сообщениями для ведущего
class BroadcasterMessages {
    constructor() {
        this.currentStatus = 'all';
        this.messagesList = document.getElementById('messagesList');
        this.init();
    }
    
    init() {
        if (this.messagesList) {
            this.loadMessages();
            this.setupFilters();
            
            // Автообновление каждые 10 секунд
            setInterval(() => this.loadMessages(true), 10000);
        }
    }
    
    setupFilters() {
        const filters = document.querySelectorAll('.filter-status-btn');
        filters.forEach(btn => {
            btn.addEventListener('click', () => {
                filters.forEach(b => {
                    b.style.background = '';
                    b.style.color = '';
                });
                btn.style.background = '#007bff';
                btn.style.color = 'white';
                
                this.currentStatus = btn.dataset.status;
                this.loadMessages();
            });
        });
    }
    
    getAllUserMessages() {
        // Собираем сообщения от всех пользователей из localStorage
        const allMessages = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('user_messages_')) {
                const messages = JSON.parse(localStorage.getItem(key));
                if (messages && Array.isArray(messages)) {
                    allMessages.push(...messages);
                }
            }
        }
        
        // Сортируем по дате (новые сверху)
        return allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    async loadMessages(silent = false) {
        if (!silent) {
            this.messagesList.innerHTML = '<p>Загрузка сообщений...</p>';
        }
        
        try {
            let messages = this.getAllUserMessages();
            
            // Фильтрация по статусу
            if (this.currentStatus !== 'all') {
                messages = messages.filter(msg => msg.status === this.currentStatus);
            }
            
            this.renderMessages(messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
            if (!silent) {
                this.messagesList.innerHTML = '<p style="color: #dc3545;">Ошибка загрузки сообщений</p>';
            }
        }
    }
    
    renderMessages(messages) {
        if (!messages || messages.length === 0) {
            this.messagesList.innerHTML = '<p>Нет сообщений</p>';
            return;
        }
        
        this.messagesList.innerHTML = messages.map(msg => this.renderMessageCard(msg)).join('');
        
        // Добавляем обработчики для кнопок
        document.querySelectorAll('.change-status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = parseInt(btn.dataset.messageId);
                const newStatus = btn.dataset.newStatus;
                this.changeStatus(messageId, newStatus);
            });
        });
        
        document.querySelectorAll('.response-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const messageId = parseInt(btn.dataset.messageId);
                this.addResponse(messageId);
            });
        });
    }
    
    renderMessageCard(message) {
        const statusConfig = {
            'new': { text: 'Новое', color: '#007bff', nextStatus: 'in_progress', nextText: 'Взять в работу' },
            'in_progress': { text: 'В работе', color: '#ffc107', nextStatus: 'completed', nextText: 'Завершить' },
            'completed': { text: 'Завершено', color: '#28a745', nextStatus: null, nextText: null }
        };
        
        const status = statusConfig[message.status];
        if (!status) return '';
        
        const date = new Date(message.created_at).toLocaleString('ru-RU');
        const messageType = message.type === 'voice' ? '🎙 Голосовое' : '💬 Текстовое';
        
        return `
            <div class="message-card" style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div>
                        <strong>${this.escapeHtml(message.user_login || 'Пользователь')}</strong>
                        <span style="margin-left: 10px;">${messageType}</span>
                        <span style="margin-left: 10px; padding: 2px 8px; background: ${status.color}; color: white; border-radius: 4px;">
                            ${status.text}
                        </span>
                    </div>
                    <span style="color: #999; font-size: 12px;">${date}</span>
                </div>
                
                <div style="margin: 10px 0;">
                    ${message.type === 'voice' 
                        ? `<audio controls style="width: 100%;">
                            <source src="${message.voice_url || ''}" type="audio/wav">
                           </audio>`
                        : `<p style="margin: 0;">${this.escapeHtml(message.text)}</p>`
                    }
                </div>
                
                ${message.response_text ? `
                    <div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 4px;">
                        <strong>📢 Ваш ответ:</strong>
                        <p style="margin: 5px 0 0 0;">${this.escapeHtml(message.response_text)}</p>
                    </div>
                ` : ''}
                
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    ${status.nextStatus ? `
                        <button class="change-status-btn" data-message-id="${message.id}" data-new-status="${status.nextStatus}"
                                style="background: ${status.color}; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">
                            → ${status.nextText}
                        </button>
                    ` : ''}
                    
                    <button class="response-btn" data-message-id="${message.id}"
                            style="background: #28a745; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">
                        💬 Ответить
                    </button>
                </div>
            </div>
        `;
    }
    
    async changeStatus(messageId, newStatus) {
        try {
            // Находим сообщение и обновляем его статус
            let updated = false;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('user_messages_')) {
                    const messages = JSON.parse(localStorage.getItem(key));
                    const messageIndex = messages.findIndex(m => m.id === messageId);
                    
                    if (messageIndex !== -1) {
                        messages[messageIndex].status = newStatus;
                        localStorage.setItem(key, JSON.stringify(messages));
                        updated = true;
                        break;
                    }
                }
            }
            
            if (updated) {
                Utils.showNotification('Статус сообщения обновлен', 'success');
                this.loadMessages();
            } else {
                throw new Error('Сообщение не найдено');
            }
        } catch (error) {
            Utils.showNotification('Ошибка обновления статуса', 'error');
        }
    }
    
    addResponse(messageId) {
        const response = prompt('Введите ответ для слушателя (будет показан в эфире):');
        if (response && response.trim()) {
            this.sendResponse(messageId, response);
        }
    }
    
    async sendResponse(messageId, responseText) {
        try {
            let updated = false;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('user_messages_')) {
                    const messages = JSON.parse(localStorage.getItem(key));
                    const messageIndex = messages.findIndex(m => m.id === messageId);
                    
                    if (messageIndex !== -1) {
                        messages[messageIndex].response_text = responseText;
                        messages[messageIndex].status = 'completed';
                        localStorage.setItem(key, JSON.stringify(messages));
                        updated = true;
                        break;
                    }
                }
            }
            
            if (updated) {
                Utils.showNotification('Ответ отправлен слушателю', 'success');
                this.loadMessages();
            } else {
                throw new Error('Сообщение не найдено');
            }
        } catch (error) {
            Utils.showNotification('Ошибка отправки ответа', 'error');
        }
    }
    
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Инициализация
let broadcasterMessages;