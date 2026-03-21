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
    const loginForm = document.getElementById('loginForm');
    const loginInput = document.getElementById('login');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('errorMessage');
    
    // Очищаем ошибки при вводе
    if (loginInput) {
        loginInput.addEventListener('input', () => {
            if (errorDiv) errorDiv.style.display = 'none';
        });
    }
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            if (errorDiv) errorDiv.style.display = 'none';
        });
    }
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = loginInput.value.trim();
        const password = passwordInput.value;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        
        // Очищаем предыдущие ошибки
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
        
        // Простая валидация на клиенте
        if (!login) {
            if (errorDiv) {
                errorDiv.textContent = 'Введите логин';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        if (!password) {
            if (errorDiv) {
                errorDiv.textContent = 'Введите пароль';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';
            
            await API.login(login, password);
            Utils.showNotification('Вход выполнен успешно', 'success');
            window.location.href = '/index.html';
        } catch (error) {
            console.error('Login error:', error);
            if (errorDiv) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
            }
            submitBtn.disabled = false;
            submitBtn.textContent = 'Вход';
        }
    });
}

// Обработка регистрации
if (document.getElementById('registerForm')) {
    const registerForm = document.getElementById('registerForm');
    const loginInput = document.getElementById('login');
    const fullnameInput = document.getElementById('fullname');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    
    // Функция для очистки ошибок
    const clearErrors = () => {
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
        if (successDiv) {
            successDiv.style.display = 'none';
            successDiv.textContent = '';
        }
    };
    
    // Очищаем ошибки при вводе
    [loginInput, fullnameInput, passwordInput, confirmPasswordInput].forEach(input => {
        if (input) {
            input.addEventListener('input', clearErrors);
        }
    });
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = loginInput.value.trim();
        const fullname = fullnameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        
        // Очищаем предыдущие сообщения
        clearErrors();
        
        // Клиентская валидация
        if (!Utils.validateLogin(login)) {
            if (errorDiv) {
                errorDiv.textContent = 'Логин должен содержать только латинские буквы (A-Z, a-z)';
                errorDiv.style.display = 'block';
            }
            loginInput.focus();
            return;
        }
        
        if (!Utils.validateFullName(fullname)) {
            if (errorDiv) {
                errorDiv.textContent = 'ФИО должно содержать только русские буквы и пробелы';
                errorDiv.style.display = 'block';
            }
            fullnameInput.focus();
            return;
        }
        
        if (password.length < 4) {
            if (errorDiv) {
                errorDiv.textContent = 'Пароль должен быть не менее 4 символов';
                errorDiv.style.display = 'block';
            }
            passwordInput.focus();
            return;
        }
        
        if (!Utils.validatePassword(password)) {
            if (errorDiv) {
                errorDiv.textContent = 'Пароль может содержать только латинские буквы, цифры и символы';
                errorDiv.style.display = 'block';
            }
            passwordInput.focus();
            return;
        }
        
        if (password !== confirmPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'Пароли не совпадают';
                errorDiv.style.display = 'block';
            }
            confirmPasswordInput.focus();
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Регистрация...';
            
            await API.register({ 
                login, 
                fullname, 
                password,
                password_confirm: confirmPassword 
            });
            
            if (successDiv) {
                successDiv.textContent = 'Регистрация успешна! Перенаправление на страницу входа...';
                successDiv.style.display = 'block';
            }
            
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } catch (error) {
            console.error('Registration error:', error);
            if (errorDiv) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
            }
            submitBtn.disabled = false;
            submitBtn.textContent = 'Зарегистрироваться';
        }
    });
}