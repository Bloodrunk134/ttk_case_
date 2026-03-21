const Utils = {
    validateLogin: (login) => {
        if (!login || typeof login !== 'string') return false;
        // Только латинские буквы, минимум 1 символ
        const regex = /^[A-Za-z]+$/;
        return regex.test(login);
    },
    
    validateFullName: (fullname) => {
        if (!fullname || typeof fullname !== 'string') return false;
        // Русские буквы, пробелы, минимум 2 символа
        const regex = /^[А-Яа-яЁё\s]{2,}$/;
        return regex.test(fullname);
    },
    
    validatePassword: (password) => {
        if (!password || typeof password !== 'string') return false;
        // Латинские буквы, цифры, спецсимволы, минимум 4 символа
        const regex = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;
        return regex.test(password);
    },
    
    formatDate: (date) => {
        try {
            const d = new Date(date);
            return d.toLocaleDateString('ru-RU');
        } catch(e) {
            return date;
        }
    },
    
    formatDateTime: (date) => {
        try {
            const d = new Date(date);
            return d.toLocaleString('ru-RU');
        } catch(e) {
            return date;
        }
    },
    
    getCurrentUser: () => {
        try {
            const userStr = localStorage.getItem('currentUser');
            return userStr ? JSON.parse(userStr) : null;
        } catch(e) {
            return null;
        }
    },
    
    hasRole: (user, role) => {
        if (!user || !user.roles) return false;
        const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
        return roles.includes(role);
    },
    
    canAccessAdmin: (user) => {
        return user && Utils.hasRole(user, 'admin');
    },
    
    canAccessBroadcaster: (user) => {
        return user && (Utils.hasRole(user, 'broadcaster') || Utils.hasRole(user, 'admin'));
    },
    
    showNotification: (message, type = 'info') => {
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    },
    
    escapeHtml: (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};