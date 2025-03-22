module.exports = {
    apps: [
      {
        name: 'backend', // Название приложения
        script: 'manage.py', // Точка входа (manage.py)
        args: 'runserver', // Аргументы для запуска сервера
        interpreter: '/root/website/.venv/bin/python3.10', // Путь к Python в виртуальном окружении
        env: {
          DJANGO_SETTINGS_MODULE: 'backend.settings', // Модуль настроек Django
          PYTHONPATH: '/root/website/backend', // Путь к проекту Django
        },
        cwd: '/root/website/backend', // Рабочая директория
      },
    ],
  };