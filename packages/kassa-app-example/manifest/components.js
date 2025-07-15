// packages/kassa-app-example/manifest/components.js
// Этот файл регистрирует все UI-компоненты (шаблоны и стили).
// Такой подход позволяет централизованно управлять всеми "кирпичиками" интерфейса.

module.exports = {
  // --- Макеты страниц (Layouts) ---
  
  // Основной макет для главного экрана приложения.
  mainLayout: 'main-layout.html',
  
  // Макет для страниц входа и регистрации.
  authLayout: 'auth-layout.html',

  // --- Компоненты-страницы (для SPA-навигации) ---

  // Форма входа. Добавляем свойство 'title' для SPA.
  loginForm: { 
    template: 'login-form.html', 
    title: 'Вход в систему' 
  },

  // Форма регистрации. Также со своим 'title'.
  registerForm: { 
    template: 'register-form.html', 
    title: 'Регистрация' 
  },

  // --- Переиспользуемые UI-компоненты ---
  
  // Компонент чека, включающий шаблон и изолированные стили.
  receipt: { 
    template: 'receipt.html', 
    style: 'receipt.css' 
  },
  
  // Компонент списка товаров, также со своими стилями.
  positionsList: { 
    template: 'positionsList.html', 
    style: 'positionsList.css' 
  }
};