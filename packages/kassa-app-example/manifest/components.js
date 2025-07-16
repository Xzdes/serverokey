// packages/kassa-app-example/manifest/components.js
// Этот файл регистрирует все UI-компоненты (шаблоны и стили).

module.exports = {
  // --- Макеты страниц (Layouts) ---
  mainLayout: 'main-layout.html',
  
  // --- Компоненты-страницы, которые вставляются в главный макет ---
  authLayout: { 
    template: 'auth-layout.html'
    // Стили для этого компонента инкапсулированы внутри самого .html файла
  },
  cashierPage: { // <-- Регистрация нового компонента-страницы
    template: 'cashier-page.html'
    // Стили для этого компонента также инкапсулированы внутри .html файла
  },

  // --- Вложенные компоненты (формы) ---
  loginForm: { 
    template: 'login-form.html', 
    title: 'Вход в систему' 
  },
  registerForm: { 
    template: 'register-form.html', 
    title: 'Регистрация' 
  },

  // --- Переиспользуемые UI-компоненты для главного экрана ---
  receipt: { 
    template: 'receipt.html', 
    style: 'receipt.css' 
  },
  positionsList: { 
    template: 'positionsList.html', 
    style: 'positionsList.css' 
  }
};