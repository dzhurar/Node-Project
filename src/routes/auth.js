const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

const ADMIN_NAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

function page(title, body) {
  return `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f4f6f8;
            color: #1f2933;
          }
          main {
            width: min(760px, calc(100% - 32px));
            margin: 48px auto;
            background: #fff;
            border: 1px solid #d9e2ec;
            border-radius: 8px;
            padding: 24px;
          }
          form {
            display: grid;
            gap: 12px;
            margin-top: 16px;
          }
          input, textarea, select, button {
            font: inherit;
            padding: 10px 12px;
            border: 1px solid #bcccdc;
            border-radius: 6px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
          }
          th, td {
            padding: 10px;
            border-bottom: 1px solid #d9e2ec;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f4f6f8;
          }
          button {
            cursor: pointer;
            border: 0;
            background: #2563eb;
            color: #fff;
          }
          a {
            color: #2563eb;
          }
          .error {
            color: #b91c1c;
          }
          .nav {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <main>${body}</main>
      </body>
    </html>
  `;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    if (req.session.user.role !== role) {
      return res.status(403).send(page('Нет доступа', `
        <h2>Нет доступа</h2>
        <p>Эта страница доступна только для роли: ${role}.</p>
        <p><a href="/">На главную</a></p>
      `));
    }

    next();
  };
}

router.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.redirect(req.session.user.role === 'admin' ? '/admin' : '/client');
});

router.get('/login', (req, res) => {
  res.send(page('Вход', `
    <h2>Вход</h2>
    <p>Клиент входит по имени и паролю. Работник входит как <b>admin</b> с паролем <b>${ADMIN_PASSWORD}</b>.</p>
    <form method="POST" action="/login">
      <input name="name" placeholder="Имя" required />
      <input type="password" name="password" placeholder="Пароль" required />
      <button type="submit">Войти</button>
    </form>
    <div class="nav">
      <a href="/register">Зарегистрироваться</a>
    </div>
  `));
});

router.post('/login', async (req, res) => {
  const { name, password } = req.body;

  if (name === ADMIN_NAME && password === ADMIN_PASSWORD) {
    req.session.user = { id: 0, name: ADMIN_NAME, role: 'admin' };
    return res.redirect('/admin');
  }

  const [users] = await db.query('SELECT * FROM clients WHERE name = ?', [name]);
  const user = users[0];

  if (!user) {
    return res.status(401).send(page('Ошибка входа', `
      <h2>Ошибка входа</h2>
      <p class="error">Пользователь не найден.</p>
      <p><a href="/login">Попробовать снова</a></p>
    `));
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).send(page('Ошибка входа', `
      <h2>Ошибка входа</h2>
      <p class="error">Неверный пароль.</p>
      <p><a href="/login">Попробовать снова</a></p>
    `));
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    role: user.role || 'client'
  };

  res.redirect(req.session.user.role === 'admin' ? '/admin' : '/client');
});

router.get('/register', (req, res) => {
  res.send(page('Регистрация', `
    <h2>Регистрация</h2>
    <form method="POST" action="/register">
      <input name="name" placeholder="Имя" required />
      <input name="contact_info" placeholder="Контактная информация" />
      <input type="password" name="password" placeholder="Пароль" required />
      <input type="password" name="confirm" placeholder="Повторите пароль" required />
      <button type="submit">Зарегистрироваться</button>
    </form>
    <div class="nav">
      <a href="/login">Уже есть аккаунт</a>
    </div>
  `));
});

router.post('/register', async (req, res) => {
  const { name, contact_info, password, confirm } = req.body;

  if (name === ADMIN_NAME) {
    return res.status(400).send(page('Ошибка регистрации', `
      <h2>Ошибка регистрации</h2>
      <p class="error">Имя admin зарезервировано для работника.</p>
      <p><a href="/register">Назад</a></p>
    `));
  }

  if (password !== confirm) {
    return res.status(400).send(page('Ошибка регистрации', `
      <h2>Ошибка регистрации</h2>
      <p class="error">Пароли не совпадают.</p>
      <p><a href="/register">Назад</a></p>
    `));
  }

  const [existing] = await db.query('SELECT id FROM clients WHERE name = ?', [name]);

  if (existing.length > 0) {
    return res.status(400).send(page('Ошибка регистрации', `
      <h2>Ошибка регистрации</h2>
      <p class="error">Пользователь уже существует.</p>
      <p><a href="/register">Назад</a></p>
    `));
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(
    'INSERT INTO clients (name, contact_info, password, role) VALUES (?, ?, ?, ?)',
    [name, contact_info || null, hashedPassword, 'client']
  );

  res.send(page('Регистрация успешна', `
    <h2>Регистрация успешна</h2>
    <p>Теперь можно войти и сделать заказ.</p>
    <p><a href="/login">Войти</a></p>
  `));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = {
  router,
  page,
  requireAuth,
  requireRole
};
