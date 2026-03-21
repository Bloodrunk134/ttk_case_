// Плеер и сообщения
console.log('=== Player.js started ===');

let mediaRecorder = null;
let audioChunks = [];

const currentUser = Utils.getCurrentUser();
if (!currentUser) {
    window.location.href = '/login.html';
}

// ========== ПЛЕЕР ==========
const audio = document.getElementById('streamAudio');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const volumeSlider = document.getElementById('volumeSlider');

// Тестовый аудиопоток
audio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

playBtn.addEventListener('click', () => {
    audio.play().catch(e => console.log('Playback failed:', e));
    playBtn.disabled = true;
    pauseBtn.disabled = false;
});

pauseBtn.addEventListener('click', () => {
    audio.pause();
    playBtn.disabled = false;
    pauseBtn.disabled = true;
});

volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value / 100;
});

// ========== СООБЩЕНИЯ ==========
async function loadMessages() {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;
    
    try {
        messagesList.innerHTML = '<div class="loading">⏳ Загрузка сообщений...</div>';
        
        const token = localStorage.getItem('accessToken');
        console.log('Loading messages...');
        
        const response = await fetch('/api/messages', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Messages response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const messages = await response.json();
        console.log('Messages loaded:', messages.length);
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<div class="empty-state">💬 Нет сообщений</div>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => `
            <div class="message-card">
                <div class="message-header">
                    <span class="message-user">👤 ${escapeHtml(msg.user_login || 'Вы')}</span>
                    <span class="message-date">📅 ${formatDateTime(msg.created_at)}</span>
                </div>
                <div class="message-content">💬 ${escapeHtml(msg.text)}</div>
                ${msg.response_text ? `
                    <div class="message-response" style="margin-top: 10px; padding: 8px; background: #e8f5e9; border-left: 3px solid #4caf50; border-radius: 4px;">
                        <strong>📢 Ответ ведущего:</strong><br>
                        ${escapeHtml(msg.response_text)}
                        <div style="font-size: 11px; color: #666; margin-top: 5px;">
                            ${msg.responded_at ? 'Ответ получен: ' + formatDateTime(msg.responded_at) : ''}
                        </div>
                    </div>
                ` : ''}
                <div class="message-status" style="margin-top: 8px;">
                    Статус: ${msg.status === 'new' ? '🆕 Новое' : msg.status === 'in_progress' ? '⏳ В работе' : '✅ Завершено'}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load messages:', error);
        messagesList.innerHTML = '<div class="empty-state" style="color: red;">❌ Ошибка загрузки сообщений</div>';
    }
}

// Отправка текстового сообщения
const sendBtn = document.getElementById('sendBtn');
const messageText = document.getElementById('messageText');

if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const text = messageText.value.trim();
        if (!text) {
            Utils.showNotification('Введите сообщение', 'error');
            return;
        }
        
        try {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Отправка...';
            
            const token = localStorage.getItem('accessToken');
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Ошибка отправки');
            }
            
            Utils.showNotification('✅ Сообщение отправлено!', 'success');
            messageText.value = '';
            await loadMessages();
            
        } catch (error) {
            console.error('Send error:', error);
            Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить';
        }
    });
}

// ========== ГОЛОСОВЫЕ СООБЩЕНИЯ ==========
const recordBtn = document.getElementById('recordVoiceBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingStatus = document.getElementById('recordingStatus');

if (recordBtn) {
    recordBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await sendVoiceMessage(audioBlob);
                stream.getTracks().forEach(track => track.stop());
                if (recordingStatus) recordingStatus.textContent = '';
            };
            
            mediaRecorder.start();
            recordBtn.disabled = true;
            if (stopRecordBtn) stopRecordBtn.disabled = false;
            if (recordingStatus) recordingStatus.textContent = '🔴 Запись...';
            
        } catch (error) {
            console.error('Microphone error:', error);
            Utils.showNotification('❌ Не удалось получить доступ к микрофону', 'error');
        }
    });
}

if (stopRecordBtn) {
    stopRecordBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            recordBtn.disabled = false;
            stopRecordBtn.disabled = true;
        }
    });
}

async function sendVoiceMessage(audioBlob) {
    try {
        Utils.showNotification('📤 Отправка голосового сообщения...', 'success');
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        
        const token = localStorage.getItem('accessToken');
        const response = await fetch('/api/voice-messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка отправки');
        }
        
        Utils.showNotification('✅ Голосовое сообщение отправлено!', 'success');
        await loadMessages();
        
    } catch (error) {
        console.error('Voice message error:', error);
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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
    console.log('DOM loaded, initializing player page');
    loadMessages();
    setInterval(loadMessages, 30000);
});

console.log('=== Player.js loaded successfully ===');
