console.log("=== Player.js started ===");

let mediaRecorder = null;
let audioChunks = [];
let recordedMimeType = "audio/webm";

let messagesSocket = null;
let messagesSocketReconnectTimer = null;
let messagesSocketPingTimer = null;
let isSocketManualClose = false;

let broadcasts = [];
let selectedBroadcastId = null;

const currentUser = Utils.getCurrentUser();
if (!currentUser) {
    window.location.href = "/login.html";
}

const audio = document.getElementById("streamAudio");
const broadcastSelect = document.getElementById("broadcastSelect");
const nowPlaying = document.getElementById("nowPlaying");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const volumeSlider = document.getElementById("volumeSlider");
const sendBtn = document.getElementById("sendBtn");
const messageText = document.getElementById("messageText");
const recordBtn = document.getElementById("recordVoiceBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const recordingStatus = document.getElementById("recordingStatus");

function getToken() {
    return localStorage.getItem("accessToken");
}

function escapeHtml(value) {
    if (!value) {
        return "";
    }
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

function setNowPlaying(text) {
    if (nowPlaying) {
        nowPlaying.textContent = text;
    }
}

function formatDateTime(dateString) {
    if (!dateString) {
        return "—";
    }

    try {
        return new Date(dateString).toLocaleString("ru-RU");
    } catch (error) {
        return dateString;
    }
}

function getStatusLabel(status) {
    if (status === "new") return "Новое";
    if (status === "in_progress") return "В работе";
    if (status === "completed") return "Завершено";
    return status || "—";
}

function getSelectedBroadcast() {
    return broadcasts.find((item) => item.id === selectedBroadcastId) || null;
}

function getMessagesQueryString() {
    return selectedBroadcastId ? `?broadcast_id=${encodeURIComponent(selectedBroadcastId)}` : "";
}

function shouldReloadMessagesByPayload(payload) {
    if (!payload || !payload.type) {
        return false;
    }

    const isMessageEvent =
        payload.type === "message_created" ||
        payload.type === "message_updated" ||
        payload.type === "voice_message_created" ||
        payload.type === "voice_message_updated";

    if (!isMessageEvent) {
        return false;
    }

    if (!selectedBroadcastId) {
        return true;
    }

    if (payload.broadcast_id == null) {
        return true;
    }

    return Number(payload.broadcast_id) === Number(selectedBroadcastId);
}

function updatePlayButtonsByAudioState() {
    if (!playBtn || !pauseBtn || !audio) {
        return;
    }

    const isPlaying = !audio.paused && !audio.ended;
    playBtn.disabled = isPlaying;
    pauseBtn.disabled = !isPlaying;
}

function updateCurrentBroadcastState(syncAudio = true) {
    const current = getSelectedBroadcast();

    if (!current) {
        if (syncAudio && audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        setNowPlaying("Сейчас в эфире: активные эфиры не найдены");
        updatePlayButtonsByAudioState();
        return;
    }

    const title = current.current_media_title || "без названия";
    const hostName = current.user_name || current.user_login || "ведущий";

    if (!current.current_media_url) {
        if (syncAudio && audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        setNowPlaying(`${current.name} (${hostName}) в эфире, ожидается контент`);
        updatePlayButtonsByAudioState();
        return;
    }

    const nextSource = new URL(current.current_media_url, window.location.origin).toString();
    const previousSource = audio ? audio.currentSrc : "";
    const sourceChanged = previousSource !== nextSource;

    if (syncAudio && audio) {
        const wasPlaying = !audio.paused && !audio.ended;

        if (sourceChanged) {
            audio.src = current.current_media_url;
            if (wasPlaying) {
                audio.play().catch((error) => console.log("Playback resume failed:", error));
            }
        }
    }

    setNowPlaying(`${current.name} (${hostName}) • ${title}`);
    updatePlayButtonsByAudioState();
}

function renderBroadcastOptions() {
    if (!broadcastSelect) {
        return;
    }

    if (broadcasts.length === 0) {
        broadcastSelect.innerHTML = '<option value="">Нет активных эфиров</option>';
        return;
    }

    broadcastSelect.innerHTML = broadcasts
        .map((item) => {
            const host = item.user_name || item.user_login || "ведущий";
            const mediaPart = item.current_media_title ? ` — ${item.current_media_title}` : "";
            const text = `LIVE ${item.name} (${host})${mediaPart}`;
            return `<option value="${item.id}">${escapeHtml(text)}</option>`;
        })
        .join("");

    if (selectedBroadcastId) {
        broadcastSelect.value = String(selectedBroadcastId);
    }
}

function pickBroadcastId() {
    const saved = Number(localStorage.getItem("selectedBroadcastId") || "0") || null;

    if (selectedBroadcastId && broadcasts.some((item) => item.id === selectedBroadcastId)) {
        return selectedBroadcastId;
    }

    if (saved && broadcasts.some((item) => item.id === saved)) {
        return saved;
    }

    return broadcasts.length > 0 ? broadcasts[0].id : null;
}

async function loadBroadcasts(syncAudio = true) {
    const token = getToken();
    if (!token) {
        return;
    }

    try {
        const response = await fetch("/api/broadcasts", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        broadcasts = await response.json();
        const prevSelectedId = selectedBroadcastId;
        selectedBroadcastId = pickBroadcastId();

        if (selectedBroadcastId) {
            localStorage.setItem("selectedBroadcastId", String(selectedBroadcastId));
        } else {
            localStorage.removeItem("selectedBroadcastId");
        }

        renderBroadcastOptions();
        updateCurrentBroadcastState(syncAudio);

        if (prevSelectedId !== selectedBroadcastId) {
            await loadMessages(true);
        }
    } catch (error) {
        console.error("Failed to load broadcasts:", error);
        setNowPlaying("Не удалось загрузить список эфиров");
    }
}

if (broadcastSelect) {
    broadcastSelect.addEventListener("change", async () => {
        const nextId = Number(broadcastSelect.value || "0") || null;
        selectedBroadcastId = nextId;

        if (selectedBroadcastId) {
            localStorage.setItem("selectedBroadcastId", String(selectedBroadcastId));
        } else {
            localStorage.removeItem("selectedBroadcastId");
        }

        updateCurrentBroadcastState(true);
        await loadMessages(true);
    });
}

if (playBtn && pauseBtn && audio) {
    playBtn.addEventListener("click", async () => {
        const current = getSelectedBroadcast();

        if (!current) {
            Utils.showNotification("Сначала выберите активный эфир", "error");
            return;
        }

        if (!current.current_media_url) {
            Utils.showNotification("В эфире пока нет активного трека", "error");
            return;
        }

        try {
            await audio.play();
            updatePlayButtonsByAudioState();
        } catch (error) {
            console.log("Playback failed:", error);
            Utils.showNotification("Не удалось начать воспроизведение", "error");
        }
    });

    pauseBtn.addEventListener("click", () => {
        audio.pause();
        updatePlayButtonsByAudioState();
    });

    audio.addEventListener("play", updatePlayButtonsByAudioState);
    audio.addEventListener("pause", updatePlayButtonsByAudioState);
    audio.addEventListener("ended", updatePlayButtonsByAudioState);
}

if (volumeSlider && audio) {
    volumeSlider.addEventListener("input", (event) => {
        audio.volume = event.target.value / 100;
    });
}

function getWsMessagesUrl() {
    const token = getToken();
    if (!token) {
        return null;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/messages?token=${encodeURIComponent(token)}`;
}

function scheduleSocketReconnect() {
    if (isSocketManualClose) {
        return;
    }
    if (messagesSocketReconnectTimer) {
        clearTimeout(messagesSocketReconnectTimer);
    }
    messagesSocketReconnectTimer = setTimeout(() => {
        connectMessagesSocket();
    }, 2000);
}

function startSocketPing() {
    if (messagesSocketPingTimer) {
        clearInterval(messagesSocketPingTimer);
    }
    messagesSocketPingTimer = setInterval(() => {
        if (messagesSocket && messagesSocket.readyState === WebSocket.OPEN) {
            messagesSocket.send("ping");
        }
    }, 25000);
}

function stopSocketPing() {
    if (messagesSocketPingTimer) {
        clearInterval(messagesSocketPingTimer);
        messagesSocketPingTimer = null;
    }
}

function closeMessagesSocket() {
    isSocketManualClose = true;
    if (messagesSocketReconnectTimer) {
        clearTimeout(messagesSocketReconnectTimer);
        messagesSocketReconnectTimer = null;
    }
    stopSocketPing();
    if (messagesSocket) {
        messagesSocket.close();
        messagesSocket = null;
    }
}

function connectMessagesSocket() {
    if (!("WebSocket" in window)) {
        return;
    }

    const wsUrl = getWsMessagesUrl();
    if (!wsUrl) {
        return;
    }

    if (messagesSocket && messagesSocket.readyState === WebSocket.OPEN) {
        return;
    }

    messagesSocket = new WebSocket(wsUrl);

    messagesSocket.onopen = () => {
        console.log("Messages socket connected (player)");
        startSocketPing();
    };

    messagesSocket.onmessage = (event) => {
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (shouldReloadMessagesByPayload(payload)) {
            loadMessages(false);
            return;
        }

        if (payload.type === "broadcast_updated") {
            loadBroadcasts(true);
        }
    };

    messagesSocket.onclose = () => {
        console.log("Messages socket closed (player)");
        stopSocketPing();
        if (!isSocketManualClose) {
            scheduleSocketReconnect();
        }
    };

    messagesSocket.onerror = (error) => {
        console.error("Messages socket error (player):", error);
    };
}

async function loadMessages(showLoading = true) {
    const messagesList = document.getElementById("messagesList");
    if (!messagesList) {
        return;
    }

    const token = getToken();
    if (!token) {
        return;
    }

    if (!selectedBroadcastId) {
        messagesList.innerHTML = '<div class="empty-state">Выберите активный эфир, чтобы открыть чат</div>';
        return;
    }

    try {
        if (showLoading) {
            messagesList.innerHTML = '<div class="loading">Загрузка сообщений...</div>';
        }

        const query = getMessagesQueryString();
        const [textResponse, voiceResponse] = await Promise.all([
            fetch(`/api/messages${query}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }),
            fetch(`/api/voice-messages${query}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
        ]);

        if (!textResponse.ok) {
            throw new Error(`Text messages HTTP ${textResponse.status}`);
        }
        if (!voiceResponse.ok) {
            throw new Error(`Voice messages HTTP ${voiceResponse.status}`);
        }

        const textMessages = await textResponse.json();
        const voiceMessages = await voiceResponse.json();

        const allMessages = [
            ...(textMessages || []).map((item) => ({ ...item, kind: "text" })),
            ...(voiceMessages || []).map((item) => ({ ...item, kind: "voice" }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (allMessages.length === 0) {
            messagesList.innerHTML = '<div class="empty-state">В этом эфире пока нет сообщений</div>';
            return;
        }

        messagesList.innerHTML = allMessages
            .map((message) => {
                const isVoice = message.kind === "voice";
                const bodyHtml = isVoice
                    ? `
                        <div class="message-content voice-message-content">
                            <div class="voice-message-title">Голосовое сообщение</div>
                            <audio class="voice-player" controls preload="none" src="${escapeHtml(message.file_url || "")}"></audio>
                        </div>
                    `
                    : `<div class="message-content">${escapeHtml(message.text)}</div>`;

                return `
                    <div class="message-card ${isVoice ? "voice-message-card" : ""}">
                        <div class="message-header">
                            <span class="message-user">${escapeHtml(message.user_login || "Вы")}</span>
                            <span class="message-date">${formatDateTime(message.created_at)}</span>
                        </div>
                        ${bodyHtml}
                        ${message.response_text ? `
                            <div class="message-response">
                                <strong>Ответ ведущего:</strong><br>
                                ${escapeHtml(message.response_text)}
                                <div class="message-status">
                                    ${message.responded_at ? `Получен: ${formatDateTime(message.responded_at)}` : ""}
                                </div>
                            </div>
                        ` : ""}
                        <div class="message-status">
                            Статус: ${getStatusLabel(message.status)}
                        </div>
                    </div>
                `;
            })
            .join("");
    } catch (error) {
        console.error("Failed to load messages:", error);
        messagesList.innerHTML = '<div class="empty-state">Ошибка загрузки сообщений</div>';
    }
}

if (sendBtn && messageText) {
    sendBtn.addEventListener("click", async () => {
        const text = messageText.value.trim();
        if (!text) {
            Utils.showNotification("Введите сообщение", "error");
            return;
        }

        if (!selectedBroadcastId) {
            Utils.showNotification("Сначала выберите активный эфир", "error");
            return;
        }

        try {
            sendBtn.disabled = true;
            sendBtn.textContent = "Отправка...";

            const token = getToken();
            const response = await fetch("/api/messages", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text, broadcast_id: selectedBroadcastId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Ошибка отправки");
            }

            Utils.showNotification("Сообщение отправлено", "success");
            messageText.value = "";
            await loadMessages(false);
        } catch (error) {
            console.error("Send error:", error);
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = "Отправить";
        }
    });
}

function getSupportedRecorderMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
        return "";
    }

    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4"
    ];

    for (const mimeType of candidates) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }

    return "";
}

function extensionByMimeType(mimeType) {
    const normalized = (mimeType || "").toLowerCase();
    if (normalized.includes("ogg")) return "ogg";
    if (normalized.includes("mp4")) return "m4a";
    if (normalized.includes("wav")) return "wav";
    return "webm";
}

if (recordBtn && stopRecordBtn) {
    recordBtn.addEventListener("click", async () => {
        try {
            if (!selectedBroadcastId) {
                throw new Error("Сначала выберите активный эфир");
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Браузер не поддерживает запись с микрофона");
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const supportedMimeType = getSupportedRecorderMimeType();

            mediaRecorder = supportedMimeType
                ? new MediaRecorder(stream, { mimeType: supportedMimeType })
                : new MediaRecorder(stream);

            recordedMimeType = mediaRecorder.mimeType || supportedMimeType || "audio/webm";
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blobType = recordedMimeType || "audio/webm";
                const audioBlob = new Blob(audioChunks, { type: blobType });
                await sendVoiceMessage(audioBlob, blobType);
                stream.getTracks().forEach((track) => track.stop());
                if (recordingStatus) {
                    recordingStatus.textContent = "";
                }
            };

            mediaRecorder.start();
            recordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            if (recordingStatus) {
                recordingStatus.textContent = "Идет запись...";
            }
        } catch (error) {
            console.error("Microphone error:", error);
            Utils.showNotification(error.message || "Не удалось получить доступ к микрофону", "error");
        }
    });

    stopRecordBtn.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            recordBtn.disabled = false;
            stopRecordBtn.disabled = true;
        }
    });
}

async function sendVoiceMessage(audioBlob, mimeType = "audio/webm") {
    try {
        if (!selectedBroadcastId) {
            throw new Error("Сначала выберите активный эфир");
        }

        const extension = extensionByMimeType(mimeType);
        const fileName = `voice-message.${extension}`;

        const formData = new FormData();
        formData.append("audio", audioBlob, fileName);
        formData.append("broadcast_id", String(selectedBroadcastId));

        const token = getToken();
        const response = await fetch("/api/voice-messages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Ошибка отправки");
        }

        Utils.showNotification("Голосовое сообщение отправлено", "success");
        await loadMessages(false);
    } catch (error) {
        console.error("Voice message error:", error);
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await loadBroadcasts(true);
    await loadMessages(true);
    connectMessagesSocket();

    setInterval(() => loadMessages(false), 60000);
    setInterval(() => loadBroadcasts(true), 20000);
});

window.addEventListener("beforeunload", () => {
    closeMessagesSocket();
});

console.log("=== Player.js loaded successfully ===");
