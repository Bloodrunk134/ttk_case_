// Проверка авторизации при загрузке страниц
document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = Utils.getCurrentUser();
    const currentPage = window.location.pathname;
    
    const publicPages = ['/login.html', '/register.html'];
    
    if (!publicPages.includes(currentPage)) {
        if (!API.token) {
            window.location.href = '/login.html';
            return;
        }
        
        try {
            const user = await API.getCurrentUser();
            if (!user) {
                throw new Error('Invalid user');
            }
            localStorage.setItem('currentUser', JSON.stringify(user));
            
            // Обновляем навигацию
            updateNavigation(user);
            
            // Отображаем имя пользователя
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.textContent = `👤 ${user.full_name}`;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            API.logout();
        }
    }
    
    // Обработчик выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            API.logout();
        });
    }
});

function updateNavigation(user) {
    const adminLink = document.getElementById('adminLink');
    const broadcasterLink = document.getElementById('broadcasterLink');
    
    if (adminLink && Utils.canAccessAdmin(user)) {
        adminLink.style.display = 'flex';
    }
    
    if (broadcasterLink && Utils.canAccessBroadcaster(user)) {
        broadcasterLink.style.display = 'flex';
    }
}

// Обработка логина
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = document.getElementById('login').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('errorMessage');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';
            
            await API.login(login, password);
            Utils.showNotification('Вход выполнен успешно', 'success');
            window.location.href = '/index.html';
        } catch (error) {
            errorDiv.textContent = error.message;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Вход';
        }
    });
}

// Обработка регистрации
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = document.getElementById('login').value;
        const fullname = document.getElementById('fullname').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDiv = document.getElementById('errorMessage');
        const successDiv = document.getElementById('successMessage');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        
        if (!Utils.validateLogin(login)) {
            errorDiv.textContent = 'Логин должен содержать только латинские буквы';
            return;
        }
        
        if (!Utils.validateFullName(fullname)) {
            errorDiv.textContent = 'ФИО должно содержать только русские буквы';
            return;
        }
        
        if (!Utils.validatePassword(password)) {
            errorDiv.textContent = 'Пароль может содержать только латинские буквы, цифры и символы';
            return;
        }
        
        if (password !== confirmPassword) {
            errorDiv.textContent = 'Пароли не совпадают';
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Регистрация...';
            
            await API.register({ login, fullname, password });
            successDiv.textContent = 'Регистрация успешна! Перенаправление...';
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } catch (error) {
            errorDiv.textContent = error.message;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Зарегистрироваться';
        }
    });
}
