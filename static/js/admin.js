// Административная панель
console.log('=== Admin.js started ===');

let currentUserId = null;
let currentFilters = {};

// Проверка прав доступа
const currentUser = Utils.getCurrentUser();
console.log('Current user:', currentUser);

if (!currentUser || !Utils.canAccessAdmin(currentUser)) {
    console.log('Access denied. Redirecting...');
    window.location.href = '/index.html';
}

document.getElementById('userName').textContent = `👤 ${currentUser.full_name}`;

// ========== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ==========
async function loadUsers() {
    const tableBody = document.getElementById('usersTableBody');
    
    try {
        tableBody.innerHTML = '米<table border="1" cellpadding="10"> 米<td colspan="6" class="loading">⏳ Загрузка пользователей... 米</td> 米</table>';
        
        const token = localStorage.getItem('accessToken');
        console.log('Token:', token ? token.substring(0, 50) + '...' : 'null');
        
        if (!token) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color: red;">❌ Не авторизован. Пожалуйста, войдите снова.</td></tr>';
            return;
        }
        
        // НЕ передаем роль в URL, чтобы избежать ошибки 500
        const params = new URLSearchParams();
        if (currentFilters.login) params.append('login', currentFilters.login);
        if (currentFilters.fullname) params.append('full_name', currentFilters.fullname);
        if (currentFilters.date) params.append('date_from', currentFilters.date);
        
        const url = `/api/admin/users${params.toString() ? '?' + params.toString() : ''}`;
        console.log('Fetching users from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.status === 401) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('currentUser');
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        let users = await response.json();
        console.log('Users loaded from server:', users.length);
        
        // Фильтрация по ролям на клиенте
        if (currentFilters.role) {
            users = users.filter(user => {
                let userRoles = user.roles;
                // Если roles это строка JSON, парсим
                if (typeof userRoles === 'string') {
                    try {
                        userRoles = JSON.parse(userRoles);
                    } catch(e) {
                        userRoles = [userRoles];
                    }
                }
                // Если roles это массив
                if (Array.isArray(userRoles)) {
                    return userRoles.includes(currentFilters.role);
                }
                // Если roles это строка
                return userRoles === currentFilters.role;
            });
            console.log('Filtered by role:', currentFilters.role, 'found:', users.length);
        }
        
        if (!users || users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">📭 Пользователи не найдены</td></tr>';
            return;
        }
        
        tableBody.innerHTML = users.map(user => `
            <tr data-user-id="${user.id}">
                <td>${user.id}</td>
                <td><strong>${escapeHtml(user.login)}</strong></td>
                <td>${escapeHtml(user.full_name)}</td>
                <td>${formatRoles(user.roles)}</td>
                <td>${formatDate(user.created_at)}</td>
                <td class="action-buttons">
                    <button class="action-btn edit" onclick="editUser(${user.id})">✏️ Редактировать</button>
                    <button class="action-btn delete" onclick="deleteUser(${user.id})">🗑️ Удалить</button>
                    <button class="action-btn password" onclick="changePassword(${user.id})">🔑 Сменить пароль</button>
                    <button class="action-btn roles" onclick="assignRoles(${user.id})">👥 Назначить роли</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load users:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color: red;">❌ Ошибка: ${error.message}</td></tr>`;
        Utils.showNotification('Ошибка загрузки пользователей: ' + error.message, 'error');
    }
}

function formatRoles(roles) {
    if (!roles) return '—';
    
    let rolesArray = roles;
    if (typeof roles === 'string') {
        try {
            rolesArray = JSON.parse(roles);
        } catch(e) {
            rolesArray = [roles];
        }
    }
    
    if (!Array.isArray(rolesArray)) rolesArray = [rolesArray];
    
    const roleNames = {
        'admin': '<span class="role-badge role-admin">👑 Админ</span>',
        'broadcaster': '<span class="role-badge role-broadcaster">🎙️ Ведущий</span>',
        'user': '<span class="role-badge role-user">👤 Пользователь</span>'
    };
    
    return rolesArray.map(r => roleNames[r] || r).join(' ');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

// ========== ФИЛЬТРАЦИЯ ==========
const filterLogin = document.getElementById('filterLogin');
const filterFullname = document.getElementById('filterFullname');
const filterRole = document.getElementById('filterRole');
const filterDate = document.getElementById('filterDate');
const applyFilters = document.getElementById('applyFilters');
const resetFilters = document.getElementById('resetFilters');

if (applyFilters) {
    applyFilters.addEventListener('click', () => {
        currentFilters = {
            login: filterLogin?.value || '',
            fullname: filterFullname?.value || '',
            role: filterRole?.value || '',
            date: filterDate?.value || ''
        };
        console.log('Filters applied:', currentFilters);
        loadUsers();
    });
}

if (resetFilters) {
    resetFilters.addEventListener('click', () => {
        if (filterLogin) filterLogin.value = '';
        if (filterFullname) filterFullname.value = '';
        if (filterRole) filterRole.value = '';
        if (filterDate) filterDate.value = '';
        currentFilters = {};
        console.log('Filters reset');
        loadUsers();
    });
}

// ========== РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ ==========
window.editUser = async (userId) => {
    const token = localStorage.getItem('accessToken');
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const user = await response.json();
        
        currentUserId = userId;
        const modal = document.getElementById('editModal');
        document.getElementById('editLogin').value = user.login;
        document.getElementById('editFullname').value = user.full_name;
        modal.style.display = 'block';
    } catch (error) {
        Utils.showNotification('Ошибка загрузки данных пользователя', 'error');
    }
};

// ========== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ==========
window.deleteUser = async (userId) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    
    const token = localStorage.getItem('accessToken');
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Ошибка удаления');
        
        Utils.showNotification('Пользователь удален', 'success');
        loadUsers();
    } catch (error) {
        Utils.showNotification(error.message, 'error');
    }
};

// ========== СМЕНА ПАРОЛЯ ==========
window.changePassword = (userId) => {
    currentUserId = userId;
    document.getElementById('passwordModal').style.display = 'block';
};

// ========== НАЗНАЧЕНИЕ РОЛЕЙ ==========
window.assignRoles = async (userId) => {
    currentUserId = userId;
    const token = localStorage.getItem('accessToken');
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const user = await response.json();
        
        const modal = document.getElementById('rolesModal');
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
        
        let rolesArray = user.roles;
        if (typeof rolesArray === 'string') {
            try {
                rolesArray = JSON.parse(rolesArray);
            } catch(e) {
                rolesArray = [rolesArray];
            }
        }
        
        checkboxes.forEach(cb => {
            cb.checked = rolesArray && rolesArray.includes(cb.value);
        });
        
        modal.style.display = 'block';
    } catch (error) {
        Utils.showNotification('Ошибка загрузки ролей', 'error');
    }
};

// Обработчики форм
const editForm = document.getElementById('editUserForm');
if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = document.getElementById('editLogin').value;
        const fullname = document.getElementById('editFullname').value;
        const token = localStorage.getItem('accessToken');
        
        if (!Utils.validateLogin(login)) {
            Utils.showNotification('Логин должен содержать только латинские буквы', 'error');
            return;
        }
        
        if (!Utils.validateFullName(fullname)) {
            Utils.showNotification('ФИО должно содержать только русские буквы', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${currentUserId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ login, full_name: fullname })
            });
            
            if (!response.ok) throw new Error('Ошибка обновления');
            
            Utils.showNotification('Пользователь обновлен', 'success');
            closeModal('editModal');
            loadUsers();
        } catch (error) {
            Utils.showNotification(error.message, 'error');
        }
    });
}

const passwordForm = document.getElementById('changePasswordForm');
if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const token = localStorage.getItem('accessToken');
        
        if (newPassword !== confirmPassword) {
            Utils.showNotification('Пароли не совпадают', 'error');
            return;
        }
        
        if (!Utils.validatePassword(newPassword)) {
            Utils.showNotification('Пароль может содержать только латинские буквы, цифры и символы', 'error');
            return;
        }
        
        if (newPassword.length < 4) {
            Utils.showNotification('Пароль должен быть не менее 4 символов', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${currentUserId}/password`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: newPassword })
            });
            
            if (!response.ok) throw new Error('Ошибка смены пароля');
            
            Utils.showNotification('Пароль успешно изменен', 'success');
            closeModal('passwordModal');
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        } catch (error) {
            Utils.showNotification(error.message, 'error');
        }
    });
}

const rolesForm = document.getElementById('assignRolesForm');
if (rolesForm) {
    rolesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const roles = [];
        const checkboxes = document.querySelectorAll('#rolesModal input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (cb.checked) roles.push(cb.value);
        });
        
        if (roles.length === 0) {
            Utils.showNotification('Необходимо выбрать хотя бы одну роль', 'error');
            return;
        }
        
        const token = localStorage.getItem('accessToken');
        
        try {
            const response = await fetch(`/api/admin/users/${currentUserId}/roles`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ roles })
            });
            
            if (!response.ok) throw new Error('Ошибка назначения ролей');
            
            Utils.showNotification('Роли назначены', 'success');
            closeModal('rolesModal');
            loadUsers();
        } catch (error) {
            Utils.showNotification(error.message, 'error');
        }
    });
}

// ========== ЗАКРЫТИЕ МОДАЛЬНЫХ ОКОН ==========
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        const modal = closeBtn.closest('.modal');
        if (modal) modal.style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing admin page');
    loadUsers();
});

console.log('=== Admin.js loaded successfully ===');
