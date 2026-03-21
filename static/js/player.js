// Глобальные переменные
let mediaRecorder = null;
let audioChunks = [];

// Проверка авторизации
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
    try {
        const messages = await API.getMessages();
        const messagesList = document.getElementById('messagesList');
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<div class="loading">Нет сообщений</div>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => `
            <div class="message-card">
                <div class="message-header">
                    <span class="message-user">${Utils.escapeHtml(msg.user_login || 'Вы')}</span>
                    <span class="message-date">${Utils.formatDateTime(msg.created_at)}</span>
                </div>
                <div class="message-content">${Utils.escapeHtml(msg.text)}</div>
                <div class="message-status">
                    Статус: ${msg.status === 'new' ? '🆕 Новое' : msg.status === 'in_progress' ? '⏳ В работе' : '✅ Завершено'}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load messages:', error);
        document.getElementById('messagesList').innerHTML = '<div class="loading" style="color: red;">Ошибка загрузки сообщений</div>';
    }
}

// Отправка текстового сообщения
const sendBtn = document.getElementById('sendBtn');
const messageText = document.getElementById('messageText');

sendBtn.addEventListener('click', async () => {
    const text = messageText.value.trim();
    if (!text) {
        Utils.showNotification('Введите сообщение', 'error');
        return;
    }
    
    try {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Отправка...';
        
        await API.sendMessage({ text });
        Utils.showNotification('✅ Сообщение отправлено!', 'success');
        messageText.value = '';
        await loadMessages();
        
    } catch (error) {
        Utils.showNotification('❌ Ошибка: ' + error.message, 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить';
    }
});

// ========== ГОЛОСОВЫЕ СООБЩЕНИЯ ==========
const recordBtn = document.getElementById('recordVoiceBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingStatus = document.getElementById('recordingStatus');

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
            recordingStatus.textContent = '';
        };
        
        mediaRecorder.start();
        recordBtn.disabled = true;
        stopRecordBtn.disabled = false;
        recordingStatus.textContent = '🔴 Запись...';
        
    } catch (error) {
        console.error('Microphone error:', error);
        Utils.showNotification('❌ Не удалось получить доступ к микрофону', 'error');
    }
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.disabled = false;
        stopRecordBtn.disabled = true;
    }
});

async function sendVoiceMessage(audioBlob) {
    try {
        Utils.showNotification('📤 Отправка голосового сообщения...', 'success');
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        
        const response = await fetch('/api/voice-messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API.token}`
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

// Загружаем сообщения при загрузке страницы
loadMessages();
setInterval(loadMessages, 30000); // Обновляем каждые 30 секунд
