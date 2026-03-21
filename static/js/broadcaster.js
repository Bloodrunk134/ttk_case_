// Панель ведущего
console.log('=== Broadcaster.js started ===');

let currentFilter = 'all';
let currentPlaylist = [];
let mediaLibrary = [];
let currentPlaylistId = null;
let currentPlaylistName = '';
let allPlaylists = [];

// Проверка прав доступа
const currentUser = Utils.getCurrentUser();
console.log('Current user:', currentUser);

if (!currentUser || (!Utils.canAccessBroadcaster(currentUser) && !Utils.canAccessAdmin(currentUser))) {
    console.log('Access denied. Redirecting...');
    window.location.href = '/index.html';
}

document.getElementById('userName').textContent = `👤 ${currentUser.full_name}`;

// Показываем ссылку на админку если есть права
if (Utils.canAccessAdmin(currentUser)) {
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = 'flex';
}

// ========== ЗАГРУЗКА МЕДИАТЕКИ ==========
async function loadMediaLibrary() {
    const mediaLibraryDiv = document.getElementById('mediaLibrary');
    
    try {
        mediaLibraryDiv.innerHTML = '<div class="loading">⏳ Загрузка медиатеки...</div>';
        
        const response = await fetch('/api/broadcaster/media', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки медиатеки');
        }
        
        mediaLibrary = await response.json();
        console.log('Media library loaded:', mediaLibrary.length);
        
        if (!mediaLibrary || mediaLibrary.length === 0) {
            mediaLibraryDiv.innerHTML = '<div class="empty-state">📁 Медиатека пуста. Загрузите файлы.</div>';
            return;
        }
        
        mediaLibraryDiv.innerHTML = mediaLibrary.map(file => `
            <div class="media-item">
                <span>${file.file_type === 'audio' ? '🎵' : '🎬'} ${escapeHtml(file.file_name)} (${formatFileSize(file.file_size)})</span>
                <button class="btn-sm btn-secondary" onclick="addToPlaylist(${file.id})">➕ Добавить</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load media:', error);
        mediaLibraryDiv.innerHTML = '<div class="empty-state" style="color: red;">❌ Ошибка загрузки медиатеки</div>';
    }
}

// ========== ЗАГРУЗКА ПЛЕЙЛИСТОВ ==========
async function loadPlaylists() {
    try {
        const response = await fetch('/api/broadcaster/playlists', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки плейлистов');
        
        allPlaylists = await response.json();
        console.log('All playlists loaded:', allPlaylists);
        
        // Обновляем выпадающий список
        const selector = document.getElementById('playlistSelector');
        if (selector) {
            selector.innerHTML = '<option value="">-- Выберите плейлист --</option>' +
                allPlaylists.map(p => `<option value="${p.id}" ${currentPlaylistId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} ${p.is_active ? '(активен)' : ''}</option>`).join('');
        }
        
        // Если есть выбранный плейлист, загружаем его элементы
        if (currentPlaylistId) {
            await loadPlaylistItems(currentPlaylistId);
        } else if (allPlaylists.length > 0) {
            // Если нет выбранного, выбираем первый
            currentPlaylistId = allPlaylists[0].id;
            currentPlaylistName = allPlaylists[0].name;
            if (selector) selector.value = currentPlaylistId;
            await loadPlaylistItems(currentPlaylistId);
        } else {
            currentPlaylistId = null;
            document.getElementById('playlistItems').innerHTML = '<div class="empty-state">📋 Нет плейлистов. Создайте новый</div>';
        }
        
    } catch (error) {
        console.error('Failed to load playlists:', error);
    }
}

// Обработчик выбора плейлиста
document.getElementById('playlistSelector')?.addEventListener('change', async (e) => {
    const playlistId = parseInt(e.target.value);
    if (playlistId) {
        currentPlaylistId = playlistId;
        const selectedPlaylist = allPlaylists.find(p => p.id === playlistId);
        currentPlaylistName = selectedPlaylist ? selectedPlaylist.name : '';
        await loadPlaylistItems(playlistId);
    } else {
        currentPlaylistId = null;
        document.getElementById('playlistItems').innerHTML = '<div class="empty-state">📋 Выберите плейлист</div>';
    }
});

async function loadPlaylistItems(playlistId) {
    if (!playlistId) {
        console.log('No playlist ID, skipping load');
        document.getElementById('playlistItems').innerHTML = '<div class="empty-state">📋 Выберите плейлист</div>';
        return;
    }
    
    try {
        console.log('Loading playlist items for:', playlistId);
        const response = await fetch(`/api/broadcaster/playlists/${playlistId}/items`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки элементов плейлиста');
        
        currentPlaylist = await response.json();
        console.log('Playlist items loaded:', currentPlaylist);
        
        const playlistDiv = document.getElementById('playlistItems');
        
        if (!currentPlaylist || currentPlaylist.length === 0) {
            playlistDiv.innerHTML = '<div class="empty-state">📋 Плейлист пуст. Добавьте треки из медиатеки</div>';
            return;
        }
        
        playlistDiv.innerHTML = currentPlaylist.map((item, index) => `
            <div class="playlist-item" data-index="${index}">
                <span>${index + 1}. ${item.media?.file_type === 'audio' ? '🎵' : '🎬'} ${escapeHtml(item.media?.file_name || 'Трек')}</span>
                <button class="btn-sm btn-secondary" onclick="removeFromPlaylist(${item.id})">🗑 Удалить</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load playlist items:', error);
        document.getElementById('playlistItems').innerHTML = '<div class="empty-state" style="color: red;">❌ Ошибка загрузки плейлиста</div>';
    }
}

// ========== УПРАВЛЕНИЕ ПЛЕЙЛИСТОМ ==========
window.addToPlaylist = async (mediaId) => {
    console.log('Adding to playlist, mediaId:', mediaId, 'currentPlaylistId:', currentPlaylistId);
    
    try {
        if (!currentPlaylistId) {
            Utils.showNotification('Сначала выберите или создайте плейлист', 'error');
            return;
        }
        
        console.log('Adding to playlist:', currentPlaylistId, mediaId);
        const response = await fetch(`/api/broadcaster/playlists/${currentPlaylistId}/items`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ media_id: mediaId })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка добавления в плейлист');
        }
        
        Utils.showNotification('✅ Трек добавлен в плейлист', 'success');
        await loadPlaylistItems(currentPlaylistId);
        
    } catch (error) {
        console.error('Error adding to playlist:', error);
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
};

window.removeFromPlaylist = async (itemId) => {
    try {
        const response = await fetch(`/api/broadcaster/playlists/items/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка удаления');
        
        Utils.showNotification('🗑 Удалено из плейлиста', 'success');
        if (currentPlaylistId) {
            await loadPlaylistItems(currentPlaylistId);
        }
    } catch (error) {
        console.error('Error removing from playlist:', error);
        Utils.showNotification('Ошибка: ' + error.message, 'error');
    }
};

// ========== СООБЩЕНИЯ ==========
async function loadMessages() {
    const messagesDiv = document.getElementById('messagesList');
    
    try {
        messagesDiv.innerHTML = '<div class="loading">⏳ Загрузка сообщений...</div>';
        
        const response = await fetch('/api/messages', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки сообщений');
        
        let messages = await response.json();
        console.log('Messages loaded:', messages.length);
        
        if (currentFilter === 'new') {
            messages = messages.filter(m => m.status === 'new');
        } else if (currentFilter === 'progress') {
            messages = messages.filter(m => m.status === 'in_progress');
        } else if (currentFilter === 'completed') {
            messages = messages.filter(m => m.status === 'completed');
        }
        
        if (!messages || messages.length === 0) {
            messagesDiv.innerHTML = '<div class="empty-state">💬 Нет сообщений</div>';
            return;
        }
        
        messagesDiv.innerHTML = messages.map(msg => `
            <div class="message-card">
                <div class="message-header">
                    <span class="message-user">👤 ${escapeHtml(msg.user_login || 'Пользователь')}</span>
                    <span class="message-date">📅 ${formatDateTime(msg.created_at)}</span>
                </div>
                <div class="message-content">💬 ${escapeHtml(msg.text)}</div>
                <div class="message-status">
                    Статус: 
                    <span class="status-badge status-${msg.status === 'new' ? 'new' : msg.status === 'in_progress' ? 'progress' : 'completed'}">
                        ${msg.status === 'new' ? '🆕 Новое' : msg.status === 'in_progress' ? '⏳ В работе' : '✅ Завершено'}
                    </span>
                </div>
                <div class="message-actions">
                    ${msg.status === 'new' ? `<button class="btn-sm btn-secondary" onclick="updateMessageStatus(${msg.id}, 'in_progress')">📝 Взять в работу</button>` : ''}
                    ${msg.status === 'in_progress' ? `<button class="btn-sm btn-primary" onclick="updateMessageStatus(${msg.id}, 'completed')">✅ Завершить</button>` : ''}
                    <button class="btn-sm btn-secondary" onclick="addResponse(${msg.id})">💬 Ответить</button>
                </div>
                ${msg.response_text ? `<div class="message-response"><strong>📢 Ваш ответ:</strong> ${escapeHtml(msg.response_text)}</div>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load messages:', error);
        messagesDiv.innerHTML = '<div class="empty-state" style="color: red;">❌ Ошибка загрузки сообщений</div>';
    }
}

window.updateMessageStatus = async (messageId, status) => {
    try {
        const response = await fetch(`/api/messages/${messageId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (!response.ok) throw new Error('Ошибка обновления статуса');
        
        Utils.showNotification('✅ Статус обновлен', 'success');
        loadMessages();
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
};

window.addResponse = (messageId) => {
    const response = prompt('Введите ответ для слушателя:');
    if (response && response.trim()) {
        sendResponse(messageId, response);
    }
};

async function sendResponse(messageId, responseText) {
    try {
        await updateMessageStatus(messageId, 'completed');
        Utils.showNotification('✅ Ответ отправлен', 'success');
        loadMessages();
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
}

// ========== ЗАГРУЗКА ФАЙЛОВ ==========
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

if (uploadArea) {
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        await uploadFiles(files);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        await uploadFiles(files);
        fileInput.value = '';
    });
}

async function uploadFiles(files) {
    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const allowedAudio = ['mp3', 'wav', 'ogg'];
        const allowedVideo = ['mp4', 'webm'];
        
        if (!allowedAudio.includes(ext) && !allowedVideo.includes(ext)) {
            Utils.showNotification(`❌ Неподдерживаемый формат: ${file.name}`, 'error');
            continue;
        }
        
        const maxSize = allowedAudio.includes(ext) ? 50 * 1024 * 1024 : 1000 * 1024 * 1024;
        if (file.size > maxSize) {
            Utils.showNotification(`❌ Файл слишком большой: ${file.name}`, 'error');
            continue;
        }
        
        try {
            Utils.showNotification(`📤 Загрузка: ${file.name}...`, 'success');
            
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/broadcaster/media/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Ошибка загрузки');
            }
            
            Utils.showNotification(`✅ Загружено: ${file.name}`, 'success');
            
        } catch (error) {
            console.error('Upload error:', error);
            Utils.showNotification(`❌ Ошибка: ${file.name} - ${error.message}`, 'error');
        }
    }
    loadMediaLibrary();
}

// ========== УПРАВЛЕНИЕ ЭФИРОМ ==========
document.getElementById('startBroadcastBtn')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/broadcaster/broadcast', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_broadcasting: true })
        });
        
        if (!response.ok) throw new Error('Ошибка запуска эфира');
        
        Utils.showNotification('📡 Эфир запущен!', 'success');
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

document.getElementById('stopBroadcastBtn')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/broadcaster/broadcast', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_broadcasting: false })
        });
        
        if (!response.ok) throw new Error('Ошибка остановки эфира');
        
        Utils.showNotification('⏹ Эфир остановлен', 'success');
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

// ========== УПРАВЛЕНИЕ ПЛЕЙЛИСТОМ (кнопки) ==========
document.getElementById('createPlaylistBtn')?.addEventListener('click', async () => {
    const name = prompt('Введите название плейлиста:', 'Мой плейлист');
    if (name) {
        try {
            const response = await fetch('/api/broadcaster/playlists', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            });
            
            if (!response.ok) throw new Error('Ошибка создания');
            
            const newPlaylist = await response.json();
            Utils.showNotification('✅ Плейлист создан', 'success');
            await loadPlaylists();
            
            // Автоматически выбираем новый плейлист
            currentPlaylistId = newPlaylist.id;
            currentPlaylistName = newPlaylist.name;
            await loadPlaylistItems(currentPlaylistId);
            
        } catch (error) {
            Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
        }
    }
});

document.getElementById('clearPlaylistBtn')?.addEventListener('click', async () => {
    if (!currentPlaylistId) {
        Utils.showNotification('Сначала выберите плейлист', 'error');
        return;
    }
    
    if (!confirm('Очистить весь плейлист?')) return;
    
    try {
        const response = await fetch(`/api/broadcaster/playlists/${currentPlaylistId}/clear`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка очистки');
        
        Utils.showNotification('🗑 Плейлист очищен', 'success');
        await loadPlaylistItems(currentPlaylistId);
        
    } catch (error) {
        console.error('Error clearing playlist:', error);
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

document.getElementById('activatePlaylistBtn')?.addEventListener('click', async () => {
    if (!currentPlaylistId) {
        Utils.showNotification('Сначала выберите плейлист', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/broadcaster/playlists/${currentPlaylistId}/activate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Ошибка активации');
        
        Utils.showNotification('✅ Плейлист активирован', 'success');
        await loadPlaylists();
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

document.getElementById('loopModeBtn')?.addEventListener('click', async () => {
    if (!currentPlaylistId) {
        Utils.showNotification('Сначала выберите плейлист', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/broadcaster/playlists/${currentPlaylistId}/modes`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ loop_mode: true })
        });
        
        if (!response.ok) throw new Error('Ошибка');
        
        Utils.showNotification('🔄 Режим зацикливания включен', 'success');
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

document.getElementById('shuffleModeBtn')?.addEventListener('click', async () => {
    if (!currentPlaylistId) {
        Utils.showNotification('Сначала выберите плейлист', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/broadcaster/playlists/${currentPlaylistId}/modes`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ shuffle_mode: true })
        });
        
        if (!response.ok) throw new Error('Ошибка');
        
        Utils.showNotification('🔀 Режим перемешивания включен', 'success');
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
});

// ========== ФИЛЬТРАЦИЯ СООБЩЕНИЙ ==========
document.getElementById('filterAll')?.addEventListener('click', () => {
    currentFilter = 'all';
    loadMessages();
});
document.getElementById('filterNew')?.addEventListener('click', () => {
    currentFilter = 'new';
    loadMessages();
});
document.getElementById('filterProgress')?.addEventListener('click', () => {
    currentFilter = 'progress';
    loadMessages();
});
document.getElementById('filterCompleted')?.addEventListener('click', () => {
    currentFilter = 'completed';
    loadMessages();
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDateTime(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU');
    } catch(e) {
        return dateString;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing broadcaster page');
    loadMediaLibrary();
    loadPlaylists();
    loadMessages();
    setInterval(loadMessages, 10000);
    setInterval(loadPlaylists, 15000);
});

console.log('=== Broadcaster.js loaded successfully ===');
