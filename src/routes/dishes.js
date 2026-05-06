const express = require('express');
const db = require('../db');
const { page, requireRole } = require('./auth');

const router = express.Router();

router.get('/admin', requireRole('admin'), async (req, res) => {
  const [dishes] = await db.query('SELECT * FROM dishes ORDER BY id DESC');

  const dishList = dishes.length
    ? dishes.map((dish) => `
        <li>
          <b>${dish.name}</b> - $${dish.price}<br />
          <small>${dish.description || 'Без описания'}</small>
        </li>
      `).join('')
    : '<li>Блюд пока нет.</li>';

  res.send(page('Панель работника', `
    <h2>Панель работника</h2>
    <p>Вы вошли как ${req.session.user.name}. Здесь можно добавлять блюда.</p>

    <form method="POST" action="/admin/dishes">
      <input name="name" placeholder="Название блюда" required />
      <textarea name="description" placeholder="Описание" rows="3"></textarea>
      <input type="number" step="0.01" min="0" name="price" placeholder="Цена" required />
      <button type="submit">Добавить блюдо</button>
    </form>

    <h3>Меню</h3>
    <ul>${dishList}</ul>

    <div class="nav">
      <a href="/admin/orders">Посмотреть заказы</a>
    </div>

    <form method="POST" action="/logout">
      <button type="submit">Выйти</button>
    </form>
  `));
});

router.post('/admin/dishes', requireRole('admin'), async (req, res) => {
  const { name, description, price } = req.body;

  await db.query(
    'INSERT INTO dishes (name, description, price) VALUES (?, ?, ?)',
    [name, description || null, price]
  );

  res.redirect('/admin');
});

module.exports = router;
