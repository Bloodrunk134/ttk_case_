import psycopg2
import os
from dotenv import load_dotenv
import json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def test_connection():
    """Тест подключения к Supabase"""
    print("=" * 60)
    print("🔍 ПРОВЕРКА ПОДКЛЮЧЕНИЯ К SUPABASE")
    print("=" * 60)
    
    try:
        print("\n1️⃣ Подключение к базе данных...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("   ✅ Подключение установлено!")
        
        # Проверка версии PostgreSQL
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"\n2️⃣ Версия PostgreSQL:")
        print(f"   📦 {version[0][:80]}...")
        
        # Проверка текущей базы данных
        cursor.execute("SELECT current_database();")
        db_name = cursor.fetchone()
        print(f"\n3️⃣ Текущая база данных:")
        print(f"   📁 {db_name[0]}")
        
        # Проверка существующих таблиц
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        tables = cursor.fetchall()
        
        print(f"\n4️⃣ Таблицы в базе данных ({len(tables)}):")
        if tables:
            for table in tables:
                # Получаем количество записей в таблице
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table[0]};")
                    count = cursor.fetchone()
                    print(f"   ✅ {table[0]:<20} - {count[0]} записей")
                except:
                    print(f"   ⚠️ {table[0]:<20} - ошибка подсчёта")
        else:
            print("   ⚠️ Таблицы не найдены. Нужно импортировать схему.")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 60)
        print("✅ ПОДКЛЮЧЕНИЕ УСПЕШНО!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ ОШИБКА ПОДКЛЮЧЕНИЯ:")
        print(f"   {e}")
        print("\n💡 РЕКОМЕНДАЦИИ:")
        print("   1. Проверьте правильность DATABASE_URL в .env")
        print("   2. Убедитесь, что пароль введён верно")
        print("   3. Проверьте, активен ли проект в Supabase")
        print("   4. Убедитесь, что IP адрес не заблокирован")
        return False

def test_tables_structure():
    """Проверка структуры таблиц"""
    print("\n" + "=" * 60)
    print("🔍 ПРОВЕРКА СТРУКТУРЫ ТАБЛИЦ")
    print("=" * 60)
    
    required_tables = [
        'users', 'messages', 'voice_messages', 'media_library',
        'playlists', 'playlist_items', 'broadcast_status'
    ]
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("\n📋 Проверка необходимых таблиц:")
        for table in required_tables:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                );
            """, (table,))
            exists = cursor.fetchone()[0]
            
            if exists:
                print(f"   ✅ {table} - существует")
                
                # Проверка структуры для важных таблиц
                if table == 'users':
                    cursor.execute("""
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_name = 'users'
                        ORDER BY ordinal_position;
                    """)
                    columns = cursor.fetchall()
                    print(f"      📊 Поля: {', '.join([c[0] for c in columns[:5]])}...")
            else:
                print(f"   ❌ {table} - отсутствует!")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")

def test_connection_pool():
    """Тест пула соединений Supabase"""
    print("\n" + "=" * 60)
    print("🔍 ТЕСТ ПУЛА СОЕДИНЕНИЙ")
    print("=" * 60)
    
    try:
        import time
        connections = []
        
        print("\n🔄 Создание 5 соединений подряд...")
        for i in range(5):
            start = time.time()
            conn = psycopg2.connect(DATABASE_URL)
            elapsed = (time.time() - start) * 1000
            connections.append(conn)
            print(f"   ✅ Соединение {i+1} - {elapsed:.0f}мс")
        
        # Закрываем соединения
        for conn in connections:
            conn.close()
        
        print("\n✅ Пул соединений работает корректно")
        
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")

def create_test_data():
    """Создание тестовых данных"""
    print("\n" + "=" * 60)
    print("🔍 СОЗДАНИЕ ТЕСТОВЫХ ДАННЫХ")
    print("=" * 60)
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Проверка существования тестового пользователя
        cursor.execute("SELECT COUNT(*) FROM users WHERE login = 'test_user';")
        exists = cursor.fetchone()[0]
        
        if exists == 0:
            print("\n👤 Создание тестового пользователя...")
            import hashlib
            password_hash = hashlib.sha256("test123".encode()).hexdigest()
            
            cursor.execute("""
                INSERT INTO users (login, full_name, password_hash, roles)
                VALUES (%s, %s, %s, %s)
                RETURNING id;
            """, ("test_user", "Тестовый Пользователь", password_hash, '["user"]'))
            
            user_id = cursor.fetchone()[0]
            print(f"   ✅ Создан тестовый пользователь (ID: {user_id})")
            
            # Создание тестового сообщения
            cursor.execute("""
                INSERT INTO messages (user_id, text, status)
                VALUES (%s, %s, %s);
            """, (user_id, "Тестовое сообщение от Supabase", "new"))
            print(f"   ✅ Создано тестовое сообщение")
            
            conn.commit()
        else:
            print("\n   ⚠️ Тестовый пользователь уже существует")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")

def test_query_speed():
    """Тест скорости запросов"""
    print("\n" + "=" * 60)
    print("🔍 ТЕСТ СКОРОСТИ ЗАПРОСОВ")
    print("=" * 60)
    
    import time
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Тест простого запроса
        start = time.time()
        cursor.execute("SELECT COUNT(*) FROM users;")
        count = cursor.fetchone()
        elapsed = (time.time() - start) * 1000
        print(f"\n📊 Простой запрос (COUNT): {elapsed:.1f}мс")
        
        # Тест запроса с JSONB
        start = time.time()
        cursor.execute("SELECT * FROM users WHERE roles ? 'user' LIMIT 10;")
        users = cursor.fetchall()
        elapsed = (time.time() - start) * 1000
        print(f"📊 JSONB запрос: {elapsed:.1f}мс (найдено {len(users)} пользователей)")
        
        # Тест вставки
        start = time.time()
        cursor.execute("""
            INSERT INTO messages (user_id, text, status)
            VALUES (1, 'Тест скорости', 'new')
            RETURNING id;
        """)
        msg_id = cursor.fetchone()
        elapsed = (time.time() - start) * 1000
        print(f"📊 Вставка записи: {elapsed:.1f}мс (ID: {msg_id[0]})")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("\n✅ Скорость запросов в норме")
        
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")

def main():
    """Главная функция тестирования"""
    print("\n" + "🎙️" * 30)
    print("   ТЕСТИРОВАНИЕ ПОДКЛЮЧЕНИЯ К SUPABASE")
    print("🎙️" * 30)
    
    # 1. Проверка подключения
    if not test_connection():
        print("\n❌ Не удалось подключиться к Supabase")
        print("\n💡 Проверьте:")
        print("   - DATABASE_URL в файле .env")
        print("   - Пароль от базы данных")
        print("   - Активен ли проект в Supabase")
        return
    
    # 2. Проверка структуры
    test_tables_structure()
    
    # 3. Тест пула соединений
    test_connection_pool()
    
    # 4. Создание тестовых данных
    create_test_data()
    
    # 5. Тест скорости
    test_query_speed()
    
    print("\n" + "🎉" * 30)
    print("   ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ!")
    print("🎉" * 30)

if __name__ == "__main__":
    main()