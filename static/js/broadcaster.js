console.log("=== Broadcaster.js started ===");

let currentFilter = "all";
let currentPlaylist = [];
let mediaLibrary = [];
let allPlaylists = [];
let channels = [];
let currentPlaylistId = null;
let currentChannelId = null;

let presenterRecorder = null;
let presenterChunks = [];
let presenterMimeType = "audio/webm";

let messagesSocket = null;
let messagesSocketReconnectTimer = null;
let messagesSocketPingTimer = null;
let isSocketManualClose = false;

const currentUser = Utils.getCurrentUser();
if (!currentUser) {
    window.location.href = "/login.html";
} else {
    const isAdmin = currentUser.roles && currentUser.roles.includes("admin");
    const isBroadcaster = currentUser.roles && currentUser.roles.includes("broadcaster");
    if (!isAdmin && !isBroadcaster) {
        window.location.href = "/index.html";
    } else {
        initBroadcaster();
    }
}

function initBroadcaster() {
    const userName = document.getElementById("userName");
    if (userName) userName.textContent = currentUser.full_name;

    if (currentUser.roles && currentUser.roles.includes("admin")) {
        const adminLink = document.getElementById("adminLink");
        if (adminLink) adminLink.style.display = "flex";
    }

    setupSocket();
    setupUploadHandlers();
    setupPlaylistHandlers();
    setupChannelHandlers();
    setupFilterHandlers();
    setupPresenterRecordingHandlers();

    bootstrap();
    setInterval(() => loadMessages(false), 45000);
    setInterval(() => loadChannels(false), 15000);

    window.addEventListener("beforeunload", closeSocket);
}

function getToken() {
    return localStorage.getItem("accessToken");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function escapeHtml(value) {
    if (!value) return "";
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

function formatDateTime(value) {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleString("ru-RU");
    } catch (error) {
        return value;
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getCurrentChannel() {
    return channels.find((item) => item.id === currentChannelId) || null;
}

function getCurrentPlaylistMeta() {
    return allPlaylists.find((item) => item.id === currentPlaylistId) || null;
}

function getMessagesQueryString() {
    return currentChannelId ? `?broadcast_id=${encodeURIComponent(currentChannelId)}` : "";
}

function shouldReloadMessagesByPayload(payload) {
    if (!payload || !payload.type) return false;

    const isMessageEvent =
        payload.type === "message_created" ||
        payload.type === "message_updated" ||
        payload.type === "voice_message_created" ||
        payload.type === "voice_message_updated";

    if (!isMessageEvent) return false;
    if (!currentChannelId) return true;
    if (payload.broadcast_id == null) return true;
    return Number(payload.broadcast_id) === Number(currentChannelId);
}

async function bootstrap() {
    await Promise.allSettled([
        loadPlaylists(false),
        loadChannels(true),
        loadMediaLibrary(),
        loadMessages(true)
    ]);
}

function getWsUrl() {
    const token = getToken();
    if (!token) return null;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/messages?token=${encodeURIComponent(token)}`;
}

function startSocketPing() {
    stopSocketPing();
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

function scheduleSocketReconnect() {
    if (isSocketManualClose) return;
    if (messagesSocketReconnectTimer) clearTimeout(messagesSocketReconnectTimer);
    messagesSocketReconnectTimer = setTimeout(setupSocket, 2000);
}

function closeSocket() {
    isSocketManualClose = true;
    if (messagesSocketReconnectTimer) clearTimeout(messagesSocketReconnectTimer);
    stopSocketPing();
    if (messagesSocket) {
        messagesSocket.close();
        messagesSocket = null;
    }
}

function setupSocket() {
    if (!("WebSocket" in window)) return;
    const wsUrl = getWsUrl();
    if (!wsUrl) return;
    if (messagesSocket && messagesSocket.readyState === WebSocket.OPEN) return;

    messagesSocket = new WebSocket(wsUrl);
    messagesSocket.onopen = () => startSocketPing();
    messagesSocket.onclose = () => {
        stopSocketPing();
        scheduleSocketReconnect();
    };
    messagesSocket.onerror = (error) => console.error("Messages socket error:", error);
    messagesSocket.onmessage = (event) => {
        let payload = null;
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
            loadChannels(false);
        }
    };
}

// Media library
async function loadMediaLibrary() {
    const mediaLibraryDiv = document.getElementById("mediaLibrary");
    if (!mediaLibraryDiv) return;

    try {
        mediaLibraryDiv.innerHTML = '<div class="loading">Загрузка медиатеки...</div>';
        const response = await fetchWithTimeout("/api/broadcaster/media", {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            mediaLibraryDiv.innerHTML = '<div class="empty-state">Медиатека пуста. Загрузите файлы.</div>';
            return;
        }

        mediaLibrary = await response.json();
        if (!mediaLibrary.length) {
            mediaLibraryDiv.innerHTML = '<div class="empty-state">Медиатека пуста. Загрузите файлы.</div>';
            return;
        }

        mediaLibraryDiv.innerHTML = mediaLibrary
            .map((file) => `
                <div class="media-item">
                    <span>${file.file_type === "audio" ? "AUDIO" : "VIDEO"} ${escapeHtml(file.file_name)} (${formatFileSize(file.file_size)})</span>
                    <button class="btn-sm btn-secondary" onclick="window.addToPlaylist(${file.id})">Добавить</button>
                </div>
            `)
            .join("");
    } catch (error) {
        console.error("Failed to load media:", error);
        mediaLibraryDiv.innerHTML = '<div class="empty-state" style="color: red;">Ошибка загрузки медиатеки</div>';
    }
}

function setupUploadHandlers() {
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        uploadArea.classList.add("drag-over");
    });
    uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
    uploadArea.addEventListener("drop", async (event) => {
        event.preventDefault();
        uploadArea.classList.remove("drag-over");
        await uploadFiles(Array.from(event.dataTransfer.files || []));
    });
    fileInput.addEventListener("change", async (event) => {
        await uploadFiles(Array.from(event.target.files || []));
        fileInput.value = "";
    });
}

async function uploadFiles(files) {
    const allowedAudio = ["mp3", "wav", "ogg"];
    const allowedVideo = ["mp4", "webm"];

    for (const file of files) {
        const ext = file.name.split(".").pop().toLowerCase();
        if (!allowedAudio.includes(ext) && !allowedVideo.includes(ext)) {
            Utils.showNotification(`Неподдерживаемый формат: ${file.name}`, "error");
            continue;
        }

        const maxSize = allowedAudio.includes(ext) ? 50 * 1024 * 1024 : 1000 * 1024 * 1024;
        if (file.size > maxSize) {
            Utils.showNotification(`Файл слишком большой: ${file.name}`, "error");
            continue;
        }

        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetchWithTimeout("/api/broadcaster/media/upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Ошибка загрузки");
            }

            Utils.showNotification(`Загружено: ${file.name}`, "success");
            await loadMediaLibrary();
        } catch (error) {
            Utils.showNotification(`Ошибка загрузки ${file.name}: ${error.message}`, "error");
        }
    }
}


// Playlists
function setupPlaylistHandlers() {
    const playlistSelector = document.getElementById("playlistSelector");
    const createPlaylistBtn = document.getElementById("createPlaylistBtn");
    const activatePlaylistBtn = document.getElementById("activatePlaylistBtn");
    const loopModeBtn = document.getElementById("loopModeBtn");
    const shuffleModeBtn = document.getElementById("shuffleModeBtn");
    const clearPlaylistBtn = document.getElementById("clearPlaylistBtn");

    playlistSelector?.addEventListener("change", async () => {
        currentPlaylistId = Number(playlistSelector.value || "0") || null;
        await loadPlaylistItems(currentPlaylistId);
        updatePlaylistModeButtons();
        if (currentChannelId) await updateChannel({ playlist_id: currentPlaylistId });
    });

    createPlaylistBtn?.addEventListener("click", async () => {
        const name = prompt("Введите название плейлиста:", "Мой плейлист");
        if (!name || !name.trim()) return;
        try {
            const response = await fetchWithTimeout("/api/broadcaster/playlists", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: name.trim() })
            });
            if (!response.ok) throw new Error("Ошибка создания плейлиста");
            const created = await response.json();
            currentPlaylistId = created.id;
            await loadPlaylists(false);
            await loadPlaylistItems(currentPlaylistId);
            if (currentChannelId) await updateChannel({ playlist_id: currentPlaylistId });
            Utils.showNotification("Плейлист создан", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    activatePlaylistBtn?.addEventListener("click", async () => {
        if (!currentPlaylistId) return Utils.showNotification("Сначала выберите плейлист", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/playlists/${currentPlaylistId}/activate`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error("Ошибка активации плейлиста");
            await loadPlaylists(false);
            Utils.showNotification("Плейлист активирован", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    loopModeBtn?.addEventListener("click", async () => {
        const playlist = getCurrentPlaylistMeta();
        if (!playlist) return Utils.showNotification("Сначала выберите плейлист", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/playlists/${playlist.id}/modes`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ loop_mode: !playlist.loop_mode })
            });
            if (!response.ok) throw new Error("Ошибка обновления режима");
            await loadPlaylists(false);
            Utils.showNotification("Режим повтора обновлен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    shuffleModeBtn?.addEventListener("click", async () => {
        const playlist = getCurrentPlaylistMeta();
        if (!playlist) return Utils.showNotification("Сначала выберите плейлист", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/playlists/${playlist.id}/modes`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ shuffle_mode: !playlist.shuffle_mode })
            });
            if (!response.ok) throw new Error("Ошибка обновления режима");
            await loadPlaylists(false);
            Utils.showNotification("Режим перемешивания обновлен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    clearPlaylistBtn?.addEventListener("click", async () => {
        if (!currentPlaylistId) return Utils.showNotification("Сначала выберите плейлист", "error");
        if (!confirm("Очистить выбранный плейлист?")) return;
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/playlists/${currentPlaylistId}/clear`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error("Ошибка очистки плейлиста");
            await loadPlaylistItems(currentPlaylistId);
            Utils.showNotification("Плейлист очищен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });
}

async function loadPlaylists(syncItems = true) {
    const playlistSelector = document.getElementById("playlistSelector");
    const playlistItems = document.getElementById("playlistItems");
    try {
        if (playlistItems) playlistItems.innerHTML = '<div class="loading">Загрузка плейлистов...</div>';
        const response = await fetchWithTimeout("/api/broadcaster/playlists", {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error("Ошибка загрузки плейлистов");

        allPlaylists = await response.json();
        if (!currentPlaylistId || !allPlaylists.some((item) => item.id === currentPlaylistId)) {
            const active = allPlaylists.find((item) => item.is_active);
            currentPlaylistId = active ? active.id : (allPlaylists[0]?.id || null);
        }

        if (playlistSelector) {
            if (!allPlaylists.length) {
                playlistSelector.innerHTML = '<option value="">-- Нет плейлистов --</option>';
            } else {
                playlistSelector.innerHTML = '<option value="">-- Выберите плейлист --</option>' +
                    allPlaylists
                        .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.is_active ? " (активен)" : ""}</option>`)
                        .join("");
            }
            playlistSelector.value = currentPlaylistId ? String(currentPlaylistId) : "";
        }

        updatePlaylistModeButtons();
        if (syncItems) await loadPlaylistItems(currentPlaylistId);
    } catch (error) {
        console.error("Failed to load playlists:", error);
        if (playlistItems) playlistItems.innerHTML = '<div class="empty-state" style="color: red;">Ошибка загрузки плейлистов</div>';
    }
}

async function loadPlaylistItems(playlistId) {
    const playlistDiv = document.getElementById("playlistItems");
    if (!playlistDiv) return;
    if (!playlistId) {
        playlistDiv.innerHTML = '<div class="empty-state">Выберите плейлист</div>';
        currentPlaylist = [];
        return;
    }

    try {
        playlistDiv.innerHTML = '<div class="loading">Загрузка элементов плейлиста...</div>';
        const response = await fetchWithTimeout(`/api/broadcaster/playlists/${playlistId}/items`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error("Ошибка загрузки элементов плейлиста");
        currentPlaylist = await response.json();
        if (!currentPlaylist.length) {
            playlistDiv.innerHTML = '<div class="empty-state">Плейлист пуст. Добавьте треки из медиатеки.</div>';
            return;
        }

        playlistDiv.innerHTML = currentPlaylist
            .map((item, index) => `
                <div class="playlist-item" data-index="${index}">
                    <span>${index + 1}. ${item.media?.file_type === "audio" ? "AUDIO" : "VIDEO"} ${escapeHtml(item.media?.file_name || "Трек")}</span>
                    <button class="btn-sm btn-secondary" onclick="window.removeFromPlaylist(${item.id})">Удалить</button>
                </div>
            `)
            .join("");
    } catch (error) {
        console.error("Failed to load playlist items:", error);
        playlistDiv.innerHTML = '<div class="empty-state" style="color: red;">Ошибка загрузки плейлиста</div>';
    }
}

function updatePlaylistModeButtons() {
    const loopModeBtn = document.getElementById("loopModeBtn");
    const shuffleModeBtn = document.getElementById("shuffleModeBtn");
    const playlist = getCurrentPlaylistMeta();
    if (loopModeBtn) loopModeBtn.textContent = playlist?.loop_mode ? "Зациклить: ON" : "Зациклить";
    if (shuffleModeBtn) shuffleModeBtn.textContent = playlist?.shuffle_mode ? "Перемешать: ON" : "Перемешать";
}

window.addToPlaylist = async function (mediaId) {
    if (!currentPlaylistId) return Utils.showNotification("Сначала выберите или создайте плейлист", "error");
    try {
        const response = await fetchWithTimeout(`/api/broadcaster/playlists/${currentPlaylistId}/items`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ media_id: mediaId })
        });
        if (!response.ok) throw new Error("Ошибка добавления трека");
        await loadPlaylistItems(currentPlaylistId);
        Utils.showNotification("Трек добавлен в плейлист", "success");
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
};

window.removeFromPlaylist = async function (itemId) {
    try {
        const response = await fetchWithTimeout(`/api/broadcaster/playlists/items/${itemId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error("Ошибка удаления трека");
        if (currentPlaylistId) await loadPlaylistItems(currentPlaylistId);
        Utils.showNotification("Трек удален из плейлиста", "success");
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
};


// Channels
function setupChannelHandlers() {
    const selector = document.getElementById("broadcastSelector");
    const createBtn = document.getElementById("createBroadcastBtn");
    const startBtn = document.getElementById("startBroadcastBtn");
    const stopBtn = document.getElementById("stopBroadcastBtn");
    const nextBtn = document.getElementById("nextTrackBtn");

    selector?.addEventListener("change", async () => {
        currentChannelId = Number(selector.value || "0") || null;
        const channel = getCurrentChannel();
        if (channel && (channel.playlist_id || channel.playlist_id === null)) currentPlaylistId = channel.playlist_id;
        syncPlaylistSelector();
        updateChannelButtons();
        await loadMessages(true);
    });

    createBtn?.addEventListener("click", async () => {
        const name = prompt("Введите название эфира:", "Мой эфир");
        if (!name || !name.trim()) return;
        try {
            const response = await fetchWithTimeout("/api/broadcaster/channels", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: name.trim(), playlist_id: currentPlaylistId || null })
            });
            if (!response.ok) throw new Error("Ошибка создания эфира");
            const created = await response.json();
            currentChannelId = created.id;
            await loadChannels(false);
            Utils.showNotification("Эфир создан", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    startBtn?.addEventListener("click", async () => {
        if (!currentChannelId) return Utils.showNotification("Сначала выберите эфир", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/channels/${currentChannelId}/start`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(currentPlaylistId ? { playlist_id: currentPlaylistId } : {})
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Ошибка запуска эфира");
            }
            await loadChannels(false);
            Utils.showNotification("Эфир запущен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    stopBtn?.addEventListener("click", async () => {
        if (!currentChannelId) return Utils.showNotification("Сначала выберите эфир", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/channels/${currentChannelId}/stop`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error("Ошибка остановки эфира");
            await loadChannels(false);
            Utils.showNotification("Эфир остановлен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });

    nextBtn?.addEventListener("click", async () => {
        if (!currentChannelId) return Utils.showNotification("Сначала выберите эфир", "error");
        try {
            const response = await fetchWithTimeout(`/api/broadcaster/channels/${currentChannelId}/next`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Ошибка переключения трека");
            }
            await loadChannels(false);
            Utils.showNotification("Трек переключен", "success");
        } catch (error) {
            Utils.showNotification(`Ошибка: ${error.message}`, "error");
        }
    });
}

async function loadChannels(syncPlaylistFromChannel = true) {
    const selector = document.getElementById("broadcastSelector");
    if (!selector) return;
    try {
        const previousChannelId = currentChannelId;
        const response = await fetchWithTimeout("/api/broadcaster/channels", {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error("Ошибка загрузки эфиров");
        channels = await response.json();
        if (!currentChannelId || !channels.some((item) => item.id === currentChannelId)) currentChannelId = channels[0]?.id || null;

        selector.innerHTML = channels
            .map((channel) => {
                const marker = channel.is_live ? "LIVE" : "OFF";
                const track = channel.current_media_title ? ` — ${channel.current_media_title}` : "";
                return `<option value="${channel.id}">${escapeHtml(`${marker} ${channel.name}${track}`)}</option>`;
            })
            .join("");
        selector.value = currentChannelId ? String(currentChannelId) : "";

        if (syncPlaylistFromChannel) {
            const channel = getCurrentChannel();
            if (channel && (channel.playlist_id || channel.playlist_id === null)) currentPlaylistId = channel.playlist_id;
            syncPlaylistSelector();
        }

        updateChannelButtons();

        if (previousChannelId !== currentChannelId) {
            await loadMessages(true);
        }
    } catch (error) {
        console.error("Failed to load channels:", error);
        selector.innerHTML = '<option value="">Ошибка загрузки эфиров</option>';
    }
}

async function updateChannel(payload) {
    if (!currentChannelId) return;
    try {
        const response = await fetchWithTimeout(`/api/broadcaster/channels/${currentChannelId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Ошибка обновления эфира");
        }
        await loadChannels(false);
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
}

function syncPlaylistSelector() {
    const selector = document.getElementById("playlistSelector");
    if (!selector) return;
    selector.value = currentPlaylistId ? String(currentPlaylistId) : "";
    loadPlaylistItems(currentPlaylistId);
    updatePlaylistModeButtons();
}

function updateChannelButtons() {
    const startBtn = document.getElementById("startBroadcastBtn");
    const stopBtn = document.getElementById("stopBroadcastBtn");
    const nextBtn = document.getElementById("nextTrackBtn");
    const channel = getCurrentChannel();
    const exists = Boolean(channel);
    const isLive = Boolean(channel?.is_live);
    if (startBtn) startBtn.disabled = !exists;
    if (stopBtn) stopBtn.disabled = !exists || !isLive;
    if (nextBtn) nextBtn.disabled = !exists || !isLive;
}

// Presenter recording
function getSupportedRecorderMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4"
    ];
    for (const mimeType of candidates) {
        if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
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

function setupPresenterRecordingHandlers() {
    const recordBtn = document.getElementById("recordPresenterBtn");
    const stopBtn = document.getElementById("stopPresenterRecordBtn");
    const statusLabel = document.getElementById("presenterRecordingStatus");
    if (!recordBtn || !stopBtn) return;

    recordBtn.addEventListener("click", async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Браузер не поддерживает запись с микрофона");
            }
            if (!currentChannelId) throw new Error("Сначала выберите эфир");

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = getSupportedRecorderMimeType();
            presenterRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            presenterMimeType = presenterRecorder.mimeType || mimeType || "audio/webm";
            presenterChunks = [];

            presenterRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) presenterChunks.push(event.data);
            };

            presenterRecorder.onstop = async () => {
                const blob = new Blob(presenterChunks, { type: presenterMimeType });
                await uploadPresenterRecording(blob, presenterMimeType);
                stream.getTracks().forEach((track) => track.stop());
                if (statusLabel) statusLabel.textContent = "";
            };

            presenterRecorder.start();
            recordBtn.disabled = true;
            stopBtn.disabled = false;
            if (statusLabel) statusLabel.textContent = "Идет запись голоса ведущего...";
        } catch (error) {
            Utils.showNotification(error.message || "Не удалось начать запись", "error");
        }
    });

    stopBtn.addEventListener("click", () => {
        if (presenterRecorder && presenterRecorder.state === "recording") {
            presenterRecorder.stop();
            recordBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });
}

async function uploadPresenterRecording(blob, mimeType) {
    const extension = extensionByMimeType(mimeType);
    const fileName = `presenter.${extension}`;
    try {
        const formData = new FormData();
        formData.append("audio", blob, fileName);
        if (currentChannelId) formData.append("channel_id", String(currentChannelId));

        const response = await fetchWithTimeout("/api/broadcaster/record", {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Ошибка отправки записи");
        }
        await loadChannels(false);
        Utils.showNotification("Запись ведущего отправлена в эфир", "success");
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
}


// Messages
function setupFilterHandlers() {
    document.getElementById("filterAll")?.addEventListener("click", () => {
        currentFilter = "all";
        loadMessages(false);
    });
    document.getElementById("filterNew")?.addEventListener("click", () => {
        currentFilter = "new";
        loadMessages(false);
    });
    document.getElementById("filterProgress")?.addEventListener("click", () => {
        currentFilter = "progress";
        loadMessages(false);
    });
    document.getElementById("filterCompleted")?.addEventListener("click", () => {
        currentFilter = "completed";
        loadMessages(false);
    });
}

function messageStatusMeta(statusValue) {
    if (statusValue === "new") return { className: "new", text: "Новое" };
    if (statusValue === "in_progress") return { className: "progress", text: "В работе" };
    return { className: "completed", text: "Завершено" };
}

async function loadMessages(showLoading = true) {
    const messagesDiv = document.getElementById("messagesList");
    if (!messagesDiv) return;
    if (!currentChannelId) {
        messagesDiv.innerHTML = '<div class="empty-state">Выберите эфир, чтобы открыть чат</div>';
        return;
    }
    try {
        if (showLoading) messagesDiv.innerHTML = '<div class="loading">Загрузка сообщений...</div>';
        const query = getMessagesQueryString();

        const [textResponse, voiceResponse] = await Promise.all([
            fetch(`/api/messages${query}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
            fetch(`/api/voice-messages${query}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        ]);
        if (!textResponse.ok) throw new Error("Ошибка загрузки текстовых сообщений");
        if (!voiceResponse.ok) throw new Error("Ошибка загрузки голосовых сообщений");

        const textMessages = await textResponse.json();
        const voiceMessages = await voiceResponse.json();
        let messages = [
            ...(textMessages || []).map((item) => ({ ...item, kind: "text" })),
            ...(voiceMessages || []).map((item) => ({ ...item, kind: "voice" }))
        ];

        messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (currentFilter === "new") messages = messages.filter((item) => item.status === "new");
        if (currentFilter === "progress") messages = messages.filter((item) => item.status === "in_progress");
        if (currentFilter === "completed") messages = messages.filter((item) => item.status === "completed");

        if (!messages.length) {
            messagesDiv.innerHTML = '<div class="empty-state">Нет сообщений</div>';
            return;
        }

        messagesDiv.innerHTML = messages
            .map((message) => {
                const status = messageStatusMeta(message.status);
                const kind = message.kind || "text";
                const contentHtml = message.kind === "voice"
                    ? `
                        <div class="message-content voice-message-content">
                            <div class="voice-message-title">Голосовое сообщение</div>
                            <audio class="voice-player" controls preload="none" src="${escapeHtml(message.file_url || "")}"></audio>
                        </div>
                    `
                    : `<div class="message-content">${escapeHtml(message.text)}</div>`;

                return `
                    <div class="message-card ${message.kind === "voice" ? "voice-message-card" : ""}">
                        <div class="message-header">
                            <span class="message-user">${escapeHtml(message.user_login || "Пользователь")}</span>
                            <span class="message-date">${formatDateTime(message.created_at)}</span>
                        </div>
                        ${contentHtml}
                        ${message.response_text ? `
                            <div class="message-response">
                                <strong>Ответ ведущего:</strong><br>
                                ${escapeHtml(message.response_text)}
                            </div>
                        ` : ""}
                        <div class="message-status">
                            Статус:
                            <span class="status-badge status-${status.className}">${status.text}</span>
                        </div>
                        <div class="message-actions">
                            ${message.status === "new" ? `<button class="btn-sm btn-secondary" onclick="window.updateMessageStatus(${message.id}, '${kind}', 'in_progress')">Взять в работу</button>` : ""}
                            ${message.status === "in_progress" ? `<button class="btn-sm btn-primary" onclick="window.updateMessageStatus(${message.id}, '${kind}', 'completed')">Завершить</button>` : ""}
                            <button class="btn-sm btn-secondary" onclick="window.addResponse(${message.id}, '${kind}')">Ответить</button>
                        </div>
                    </div>
                `;
            })
            .join("");
    } catch (error) {
        console.error("Failed to load messages:", error);
        messagesDiv.innerHTML = '<div class="empty-state" style="color: red;">Ошибка загрузки сообщений</div>';
    }
}

window.updateMessageStatus = async function (messageId, messageKind, statusValue) {
    try {
        const endpoint = messageKind === "voice"
            ? `/api/voice-messages/${messageId}/status`
            : `/api/messages/${messageId}/status`;
        const response = await fetchWithTimeout(endpoint, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: statusValue })
        });
        if (!response.ok) throw new Error("Ошибка обновления статуса");
        Utils.showNotification("Статус обновлен", "success");
        await loadMessages(false);
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
};

window.addResponse = function (messageId, messageKind) {
    const responseText = prompt("Введите ответ для слушателя:");
    if (responseText && responseText.trim()) {
        sendResponse(messageId, messageKind, responseText.trim());
    }
};

async function sendResponse(messageId, messageKind, responseText) {
    try {
        const endpoint = messageKind === "voice"
            ? `/api/voice-messages/${messageId}/status`
            : `/api/messages/${messageId}/status`;
        const response = await fetchWithTimeout(endpoint, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "completed", response_text: responseText })
        });
        if (!response.ok) throw new Error("Ошибка отправки ответа");
        Utils.showNotification("Ответ отправлен", "success");
        await loadMessages(false);
    } catch (error) {
        Utils.showNotification(`Ошибка: ${error.message}`, "error");
    }
}

console.log("=== Broadcaster.js loaded successfully ===");


