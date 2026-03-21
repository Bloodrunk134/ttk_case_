// Административная панель
let currentUserId = null;
let currentFilters = {};

// Проверка прав доступа
const currentUser = Utils.getCurrentUser();
if (!currentUser || !Utils.canAccessAdmin(currentUser)) {
    window.location.href = '/index.html';
}

document.getElementById('userName').textContent = `👤 ${currentUser.full_name}`;

// ========== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ==========
async function loadUsers() {
    const tableBody = document.getElementById('usersTableBody');
    
    try {
        tableBody.innerHTML = '<tr><td colspan="6" class="loading">⏳ Загрузка пользователей...</td></tr>';
        
        // Формируем параметры фильтрации
        const params = new URLSearchParams();
        if (currentFilters.login) params.append('login', currentFilters.login);
        if (currentFilters.fullname) params.append('full_name', currentFilters.fullname);
        if (currentFilters.role) params.append('role', currentFilters.role);
        if (currentFilters.date) params.append('date_from', currentFilters.date);
        
        const url = `/api/admin/users${params.toString() ? '?' + params.toString() : ''}`;
        console.log('Fetching users:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${API.token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('Недостаточно прав. Требуется роль администратора.');
            }
            throw new Error(`Ошибка: ${response.status}`);
        }
        
        const users = await response.json();
        console.log('Users loaded:', users);
        
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
        tableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color: red;">❌ ${error.message}</td></tr>`;
        Utils.showNotification(error.message, 'error');
    }
}

function formatRoles(roles) {
    if (!roles || !Array.isArray(roles)) return '—';
    
    const roleNames = {
        'admin': '<span class="role-badge role-admin">👑 Админ</span>',
        'broadcaster': '<span class="role-badge role-broadcaster">🎙️ Ведущий</span>',
        'user': '<span class="role-badge role-user">👤 Пользователь</span>'
    };
    
    return roles.map(r => roleNames[r] || r).join(' ');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

applyFilters.addEventListener('click', () => {
    currentFilters = {
        login: filterLogin.value,
        fullname: filterFullname.value,
        role: filterRole.value,
        date: filterDate.value
    };
    loadUsers();
});

resetFilters.addEventListener('click', () => {
    filterLogin.value = '';
    filterFullname.value = '';
    filterRole.value = '';
    filterDate.value = '';
    currentFilters = {};
    loadUsers();
});

// ========== РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ ==========
window.editUser = async (userId) => {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${API.token}` }
        });
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

document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = document.getElementById('editLogin').value;
    const fullname = document.getElementById('editFullname').value;
    
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
                'Authorization': `Bearer ${API.token}`,
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

// ========== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ==========
window.deleteUser = async (userId) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя? Данные будут сохранены в архиве.')) return;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${API.token}` }
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

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
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
                'Authorization': `Bearer ${API.token}`,
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

// ========== НАЗНАЧЕНИЕ РОЛЕЙ ==========
window.assignRoles = async (userId) => {
    currentUserId = userId;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${API.token}` }
        });
        const user = await response.json();
        
        const modal = document.getElementById('rolesModal');
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = user.roles && user.roles.includes(cb.value);
        });
        modal.style.display = 'block';
    } catch (error) {
        Utils.showNotification('Ошибка загрузки ролей', 'error');
    }
};

document.getElementById('assignRolesForm').addEventListener('submit', async (e) => {
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
    
    try {
        const response = await fetch(`/api/admin/users/${currentUserId}/roles`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${API.token}`,
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

// ========== ЗАКРЫТИЕ МОДАЛЬНЫХ ОКОН ==========
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        closeBtn.closest('.modal').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
loadUsers();
