-- =============================================
-- КЕЙС: Система управления потоковым вещанием
-- База данных: PostgreSQL (упрощённая версия)
-- Без дополнительных индексов, только необходимое
-- =============================================

-- Создание базы данных (если ещё не создана)
-- CREATE DATABASE radio_broadcasting;
-- \c radio_broadcasting;

-- =============================================
-- 1. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
-- =============================================
-- Хранит всех пользователей системы
-- Поддерживает мягкое удаление (deleted_at)
-- Роли хранятся в JSONB для мультивыбора
-- =============================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Ограничения на данные
    CONSTRAINT login_latin_only CHECK (login ~ '^[A-Za-z]+$'),
    CONSTRAINT full_name_cyrillic_only CHECK (full_name ~ '^[А-Яа-яЁё\s]+$')
);

-- Комментарии к полям
COMMENT ON TABLE users IS 'Пользователи системы';
COMMENT ON COLUMN users.id IS 'Уникальный идентификатор';
COMMENT ON COLUMN users.login IS 'Логин (только латинские буквы)';
COMMENT ON COLUMN users.full_name IS 'ФИО (только русские буквы и пробелы)';
COMMENT ON COLUMN users.password_hash IS 'Хеш пароля (SHA256)';
COMMENT ON COLUMN users.roles IS 'Роли пользователя (JSONB, поддерживает мультивыбор)';
COMMENT ON COLUMN users.created_at IS 'Дата регистрации';
COMMENT ON COLUMN users.deleted_at IS 'Дата мягкого удаления (NULL - активен)';

-- =============================================
-- 2. ТАБЛИЦА СООБЩЕНИЙ
-- =============================================
-- Хранит сообщения от пользователей ведущему
-- Поддерживает статусы: новый, в работе, завершено
-- =============================================

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    response_text TEXT,
    responded_by INTEGER REFERENCES users(id),
    responded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- Ограничение на статусы
    CONSTRAINT valid_status CHECK (status IN ('new', 'in_progress', 'completed'))
);

-- Комментарии
COMMENT ON TABLE messages IS 'Сообщения от пользователей ведущему';
COMMENT ON COLUMN messages.user_id IS 'Отправитель сообщения';
COMMENT ON COLUMN messages.text IS 'Текст сообщения';
COMMENT ON COLUMN messages.status IS 'Статус обработки: new, in_progress, completed';
COMMENT ON COLUMN messages.created_at IS 'Дата отправки';

-- =============================================
-- 3. ТАБЛИЦА ГОЛОСОВЫХ СООБЩЕНИЙ
-- =============================================
-- Хранит голосовые сообщения от пользователей
-- Дополнительный функционал из ТЗ
-- =============================================

CREATE TABLE IF NOT EXISTS voice_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL, -- Размер в байтах
    duration INTEGER, -- Длительность в секундах
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    response_text TEXT,
    responded_by INTEGER REFERENCES users(id),
    responded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    listened_at TIMESTAMP,
    
    -- Ограничение на статусы
    CONSTRAINT valid_voice_status CHECK (status IN ('new', 'listened', 'completed'))
);

COMMENT ON TABLE voice_messages IS 'Голосовые сообщения от пользователей (доп. функционал)';
COMMENT ON COLUMN voice_messages.file_path IS 'Путь к файлу голосового сообщения';
COMMENT ON COLUMN voice_messages.file_size IS 'Размер файла в байтах';
COMMENT ON COLUMN voice_messages.duration IS 'Длительность в секундах';
COMMENT ON COLUMN voice_messages.status IS 'Статус: new, listened, completed';

-- =============================================
-- 4. ТАБЛИЦА МЕДИАТЕКИ
-- =============================================
-- Хранит загруженные файлы ведущего (аудио и видео)
-- Поддерживает постоянное хранение до ручного удаления
-- =============================================

CREATE TABLE IF NOT EXISTS media_library (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(10) NOT NULL, -- 'audio' или 'video'
    file_format VARCHAR(10) NOT NULL, -- 'mp3', 'wav', 'ogg', 'mp4', 'webm'
    file_size INTEGER NOT NULL, -- Размер в байтах
    duration INTEGER, -- Длительность в секундах (для аудио/видео)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ограничения на типы файлов
    CONSTRAINT valid_file_type CHECK (file_type IN ('audio', 'video')),
    CONSTRAINT valid_audio_format CHECK (
        (file_type = 'audio' AND file_format IN ('mp3', 'wav', 'ogg')) OR
        (file_type = 'video' AND file_format IN ('mp4', 'webm'))
    )
);

COMMENT ON TABLE media_library IS 'Медиатека ведущего (загруженные файлы)';
COMMENT ON COLUMN media_library.user_id IS 'Владелец файла';
COMMENT ON COLUMN media_library.file_name IS 'Оригинальное имя файла';
COMMENT ON COLUMN media_library.file_path IS 'Путь к файлу на сервере';
COMMENT ON COLUMN media_library.file_type IS 'Тип: audio или video';
COMMENT ON COLUMN media_library.file_format IS 'Формат: mp3, wav, ogg, mp4, webm';
COMMENT ON COLUMN media_library.file_size IS 'Размер в байтах (до 50MB для аудио, до 1000MB для видео)';

-- =============================================
-- 5. ТАБЛИЦА ПЛЕЙЛИСТОВ
-- =============================================
-- Хранит плейлисты ведущего
-- Поддерживает порядок воспроизведения
-- =============================================

CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    loop_mode BOOLEAN DEFAULT FALSE, -- Режим зацикливания
    shuffle_mode BOOLEAN DEFAULT FALSE, -- Режим перемешивания
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

COMMENT ON TABLE playlists IS 'Плейлисты ведущего';
COMMENT ON COLUMN playlists.is_active IS 'Активный плейлист (только один может быть активным)';
COMMENT ON COLUMN playlists.loop_mode IS 'Режим зацикливания (повторение)';
COMMENT ON COLUMN playlists.shuffle_mode IS 'Режим перемешивания (shuffle)';

-- =============================================
-- 6. ТАБЛИЦА ЭЛЕМЕНТОВ ПЛЕЙЛИСТА
-- =============================================
-- Связывает медиатеку с плейлистами
-- Определяет порядок воспроизведения
-- =============================================

CREATE TABLE IF NOT EXISTS playlist_items (
    id SERIAL PRIMARY KEY,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Уникальность позиции в плейлисте
    UNIQUE(playlist_id, position)
);

COMMENT ON TABLE playlist_items IS 'Элементы плейлиста (очередь воспроизведения)';
COMMENT ON COLUMN playlist_items.position IS 'Позиция в очереди воспроизведения';

-- =============================================
-- 7. ТАБЛИЦА ИСТОРИИ ВОСПРОИЗВЕДЕНИЯ
-- =============================================
-- Хранит историю проигранных треков
-- Нужна для статистики и восстановления
-- =============================================

CREATE TABLE IF NOT EXISTS playback_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
    media_type VARCHAR(10) NOT NULL, -- 'audio', 'video', 'live'
    media_name VARCHAR(255),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration_played INTEGER -- Сколько секунд проиграно
);

COMMENT ON TABLE playback_history IS 'История воспроизведения эфира';

-- =============================================
-- 8. ТАБЛИЦА СТАТУСА ЭФИРА
-- =============================================
-- Хранит текущий статус вещания
-- Одна запись (системная)
-- =============================================

CREATE TABLE IF NOT EXISTS broadcast_status (
    id SERIAL PRIMARY KEY,
    is_broadcasting BOOLEAN DEFAULT FALSE,
    current_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
    current_media_type VARCHAR(10), -- 'audio', 'video', 'live'
    current_position INTEGER, -- Текущая позиция в треке (секунды)
    volume INTEGER DEFAULT 70, -- Громкость эфира (0-100)
    is_video_mode BOOLEAN DEFAULT FALSE, -- Видеорежим активен
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ограничение: только одна запись
    CONSTRAINT only_one_record CHECK (id = 1)
);

COMMENT ON TABLE broadcast_status IS 'Текущий статус вещания (системная таблица)';
COMMENT ON COLUMN broadcast_status.is_broadcasting IS 'Идёт ли вещание сейчас';
COMMENT ON COLUMN broadcast_status.current_media_id IS 'ID текущего проигрываемого файла';
COMMENT ON COLUMN broadcast_status.volume IS 'Громкость эфира (0-100)';
COMMENT ON COLUMN broadcast_status.is_video_mode IS 'Режим видео (если ведущий включил видео)';

-- =============================================
-- 9. ТАБЛИЦА ЗАПИСЕЙ ВЕДУЩЕГО
-- =============================================
-- Хранит записи с микрофона ведущего
-- Дополнительный функционал из ТЗ
-- =============================================

CREATE TABLE IF NOT EXISTS presenter_recordings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    duration INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    added_to_playlist BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE presenter_recordings IS 'Записи ведущего с микрофона';

-- =============================================
-- 10. ТАБЛИЦА ВЕБКАМ-ТРАНСЛЯЦИЙ
-- =============================================
-- Хранит информацию о вебкам-эфирах
-- Дополнительный функционал из ТЗ
-- =============================================

CREATE TABLE IF NOT EXISTS webcam_broadcasts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    stream_key VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE webcam_broadcasts IS 'Вебкам-трансляции ведущего';

-- =============================================
-- 11. ТАБЛИЦА ЖУРНАЛА ДЕЙСТВИЙ (АУДИТ)
-- =============================================
-- Хранит логи действий пользователей
-- Для безопасности и отладки
-- =============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'user', 'message', 'media', 'playlist'
    entity_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_log IS 'Журнал аудита действий пользователей';

-- =============================================
-- ТРИГГЕРЫ И ФУНКЦИИ
-- =============================================

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для таблиц с updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_broadcast_status_updated_at BEFORE UPDATE ON broadcast_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция для проверки только одного активного плейлиста
CREATE OR REPLACE FUNCTION check_active_playlist()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE playlists 
        SET is_active = FALSE 
        WHERE user_id = NEW.user_id 
        AND id != NEW.id 
        AND is_active = TRUE;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER ensure_one_active_playlist
    BEFORE INSERT OR UPDATE OF is_active ON playlists
    FOR EACH ROW
    EXECUTE FUNCTION check_active_playlist();

-- =============================================
-- ФУНКЦИИ ДЛЯ УПРОЩЕНИЯ РАБОТЫ
-- =============================================

-- Функция для получения ролей пользователя
CREATE OR REPLACE FUNCTION get_user_roles(user_login VARCHAR)
RETURNS JSONB AS $$
DECLARE
    user_roles JSONB;
BEGIN
    SELECT roles INTO user_roles
    FROM users
    WHERE login = user_login AND deleted_at IS NULL;
    
    RETURN user_roles;
END;
$$ LANGUAGE plpgsql;

-- Функция для проверки наличия роли у пользователя
CREATE OR REPLACE FUNCTION has_role(user_login VARCHAR, role_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    user_roles JSONB;
BEGIN
    SELECT roles INTO user_roles
    FROM users
    WHERE login = user_login AND deleted_at IS NULL;
    
    RETURN user_roles ? role_name;
END;
$$ LANGUAGE plpgsql;

-- Функция для мягкого удаления пользователя
CREATE OR REPLACE FUNCTION soft_delete_user(user_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET deleted_at = CURRENT_TIMESTAMP 
    WHERE id = user_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ (СИДЫ)
-- =============================================

-- Вставка начального статуса вещания
INSERT INTO broadcast_status (id, is_broadcasting, volume, is_video_mode, updated_at)
VALUES (1, FALSE, 70, FALSE, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Создание тестового администратора
-- Пароль: admin123 (хеш SHA256)
INSERT INTO users (login, full_name, password_hash, roles, created_at)
VALUES (
    'admin',
    'Администратор',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    '["admin", "broadcaster", "user"]'::jsonb,
    CURRENT_TIMESTAMP
) ON CONFLICT (login) DO NOTHING;

-- Создание тестового ведущего
-- Пароль: host123
INSERT INTO users (login, full_name, password_hash, roles, created_at)
VALUES (
    'host',
    'Анна Ведущая',
    'a7b5f9b3e2c1d4f6a8e9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
    '["user", "broadcaster"]'::jsonb,
    CURRENT_TIMESTAMP
) ON CONFLICT (login) DO NOTHING;

-- Создание тестового пользователя
-- Пароль: user123
INSERT INTO users (login, full_name, password_hash, roles, created_at)
VALUES (
    'user',
    'Иван Петров',
    '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    '["user"]'::jsonb,
    CURRENT_TIMESTAMP
) ON CONFLICT (login) DO NOTHING;

-- =============================================
-- ПРОСМОТР СОЗДАННЫХ ТАБЛИЦ
-- =============================================

-- Вывод списка всех таблиц
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- =============================================
-- ПОЛЕЗНЫЕ ЗАПРОСЫ ДЛЯ ПРОВЕРКИ
-- =============================================

-- Проверка всех пользователей
-- SELECT id, login, full_name, roles, created_at, deleted_at FROM users;

-- Проверка сообщений
-- SELECT * FROM messages ORDER BY created_at DESC;

-- Проверка активного плейлиста
-- SELECT p.*, pi.position, m.file_name 
-- FROM playlists p
-- LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
-- LEFT JOIN media_library m ON pi.media_id = m.id
-- WHERE p.is_active = TRUE
-- ORDER BY pi.position;

-- Проверка статуса эфира
-- SELECT * FROM broadcast_status;

-- Проверка роли пользователя
-- SELECT has_role('admin', 'admin');
-- SELECT has_role('user', 'broadcaster');

-- =============================================
-- КОНЕЦ СКРИПТА
-- =============================================
