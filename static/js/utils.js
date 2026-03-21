const Utils = {
    validateLogin: (login) => {
        const regex = /^[A-Za-z]+$/;
        return regex.test(login);
    },
    
    validateFullName: (fullname) => {
        const regex = /^[А-Яа-я\s]+$/;
        return regex.test(fullname);
    },
    
    validatePassword: (password) => {
        const regex = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;
        return regex.test(password);
    },
    
    formatDate: (date) => {
        const d = new Date(date);
        return d.toLocaleDateString('ru-RU');
    },
    
    formatDateTime: (date) => {
        const d = new Date(date);
        return d.toLocaleString('ru-RU');
    },
    
    getCurrentUser: () => {
        const userStr = localStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    },
    
    hasRole: (user, role) => {
        return user && user.roles && user.roles.includes(role);
    },
    
    canAccessAdmin: (user) => {
        return user && Utils.hasRole(user, 'admin');
    },
    
    canAccessBroadcaster: (user) => {
        return user && (Utils.hasRole(user, 'broadcaster') || Utils.hasRole(user, 'admin'));
    },
    
    showNotification: (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    },
    
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
