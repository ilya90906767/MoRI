module.exports = {
    apps: [
      {
        name: 'backend', // Name of your application
        script: 'manage.py',   // Entry point of your application
        args: 'runserver',     // Command to run the Django development server
        interpreter: '/root/website/.venv/bin/python3.10', // Path to the Python interpreter in your venv
        env: {
          DJANGO_SETTINGS_MODULE: 'backend.settings', // Your Django settings module
          PYTHONPATH: '.',          // Path to your Django project
        },
      },
    ],
  };