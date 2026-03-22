console.log('=== TEST SCRIPT LOADED ===');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    
    // ========== ПРОВЕРКА ВКЛАДОК ==========
    const tabs = document.querySelectorAll('.tab');
    console.log('Найдено вкладок:', tabs.length);
    
    tabs.forEach((tab, index) => {
        const tabName = tab.dataset.tab;
        console.log(`Вкладка ${index + 1}:`, tabName, tab);
        
        // Добавляем обработчик
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('=== ВКЛАДКА НАЖАТА ===', tabName);
            
            // Убираем active у всех вкладок
            tabs.forEach(t => t.classList.remove('active'));
            // Добавляем active текущей
            this.classList.add('active');
            
            // Скрываем все содержимое вкладок
            const allContents = document.querySelectorAll('.tab-content');
            console.log('Найдено содержимых вкладок:', allContents.length);
            allContents.forEach(content => content.classList.remove('active'));
            
            // Показываем нужное содержимое
            const activeContent = document.getElementById(`tab-${tabName}`);
            if (activeContent) {
                activeContent.classList.add('active');
                console.log(`Показана вкладка: ${tabName}`);
            } else {
                console.log(`ОШИБКА: Не найден элемент tab-${tabName}`);
            }
        });
    });
    
    // ========== ПРОВЕРКА КНОПОК ==========
    const startBtn = document.getElementById('startBroadcastBtn');
    const stopBtn = document.getElementById('stopBroadcastBtn');
    const nextBtn = document.getElementById('nextTrackBtn');
    const prevBtn = document.getElementById('prevTrackBtn');
    
    console.log('startBroadcastBtn:', startBtn ? '✅' : '❌');
    console.log('stopBroadcastBtn:', stopBtn ? '✅' : '❌');
    console.log('nextTrackBtn:', nextBtn ? '✅' : '❌');
    console.log('prevTrackBtn:', prevBtn ? '✅' : '❌');
    
    if (startBtn) {
        startBtn.onclick = () => alert('START');
    }
    if (stopBtn) {
        stopBtn.onclick = () => alert('STOP');
    }
    if (nextBtn) {
        nextBtn.onclick = () => alert('NEXT');
    }
    if (prevBtn) {
        prevBtn.onclick = () => alert('PREV');
    }
    
    // ========== ПРОВЕРКА СОДЕРЖИМОГО ВКЛАДОК ==========
    const tabBroadcast = document.getElementById('tab-broadcast');
    const tabMedia = document.getElementById('tab-media');
    const tabMessages = document.getElementById('tab-messages');
    
    console.log('tab-broadcast:', tabBroadcast ? '✅' : '❌');
    console.log('tab-media:', tabMedia ? '✅' : '❌');
    console.log('tab-messages:', tabMessages ? '✅' : '❌');
    
    // Показываем первую вкладку
    if (tabBroadcast) tabBroadcast.classList.add('active');
    
    console.log('=== TEST SCRIPT READY ===');
});
