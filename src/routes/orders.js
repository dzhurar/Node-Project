const express = require('express');
const db = require('../db');
const { page, requireRole } = require('./auth');

const router = express.Router();

router.get('/client', requireRole('client'), async (req, res) => {
  const [dishes] = await db.query('SELECT * FROM dishes ORDER BY name');

  const dishOptions = dishes.length
    ? dishes.map((dish) => `
        <label>
          <input type="checkbox" name="dishIds" value="${dish.id}" />
          ${dish.name} - $${dish.price}
        </label>
        <input type="number" name="quantity_${dish.id}" min="1" value="1" />
      `).join('')
    : '<p>В меню пока нет блюд.</p>';

  res.send(page('Заказ клиента', `
    <h2>Заказ клиента</h2>
    <p>Здравствуйте, ${req.session.user.name}. Выберите блюда и номер столика.</p>

    <form method="POST" action="/client/orders">
      <input type="number" name="table_number" min="1" placeholder="Номер столика" required />
      ${dishOptions}
      <button type="submit" ${dishes.length ? '' : 'disabled'}>Сделать заказ</button>
    </form>

    <form method="POST" action="/logout">
      <button type="submit">Выйти</button>
    </form>
  `));
});

router.get('/admin/orders', requireRole('admin'), async (req, res) => {
  const [rows] = await db.query(`
    SELECT
      orders.id AS order_id,
      orders.table_number,
      orders.created_at,
      clients.name AS client_name,
      dishes.name AS dish_name,
      dishes.price,
      order_items.quantity,
      dishes.price * order_items.quantity AS item_total
    FROM orders
    LEFT JOIN clients ON clients.id = orders.client_id
    LEFT JOIN order_items ON order_items.order_id = orders.id
    LEFT JOIN dishes ON dishes.id = order_items.dish_id
    ORDER BY orders.created_at DESC, orders.id DESC
  `);

  const orders = new Map();

  for (const row of rows) {
    if (!orders.has(row.order_id)) {
      orders.set(row.order_id, {
        id: row.order_id,
        tableNumber: row.table_number,
        createdAt: row.created_at,
        clientName: row.client_name || 'Неизвестный клиент',
        items: [],
        total: 0
      });
    }

    const order = orders.get(row.order_id);

    if (row.dish_name) {
      const itemTotal = Number(row.item_total) || 0;

      order.items.push(`${row.dish_name} x ${row.quantity} ($${itemTotal.toFixed(2)})`);
      order.total += itemTotal;
    }
  }

  const orderRows = orders.size
    ? Array.from(orders.values()).map((order) => `
        <tr>
          <td>${order.id}</td>
          <td>${order.clientName}</td>
          <td>${order.tableNumber}</td>
          <td>${order.items.join('<br />') || 'Нет блюд'}</td>
          <td>$${order.total.toFixed(2)}</td>
          <td>${new Date(order.createdAt).toLocaleString('ru-RU')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6">Заказов пока нет.</td></tr>';

  res.send(page('Заказы', `
    <h2>Заказы</h2>

    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Клиент</th>
          <th>Столик</th>
          <th>Блюда</th>
          <th>Сумма</th>
          <th>Дата</th>
        </tr>
      </thead>
      <tbody>${orderRows}</tbody>
    </table>

    <div class="nav">
      <a href="/admin">Назад к блюдам</a>
    </div>
  `));
});

router.post('/client/orders', requireRole('client'), async (req, res) => {
  const { table_number } = req.body;
  const selectedDishIds = Array.isArray(req.body.dishIds)
    ? req.body.dishIds
    : req.body.dishIds
      ? [req.body.dishIds]
      : [];

  if (selectedDishIds.length === 0) {
    return res.status(400).send(page('Ошибка заказа', `
      <h2>Ошибка заказа</h2>
      <p class="error">Выберите хотя бы одно блюдо.</p>
      <p><a href="/client">Назад</a></p>
    `));
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [orderResult] = await connection.query(
      'INSERT INTO orders (table_number, client_id) VALUES (?, ?)',
      [table_number, req.session.user.id]
    );

    for (const dishId of selectedDishIds) {
      const quantity = Number(req.body[`quantity_${dishId}`]) || 1;

      await connection.query(
        'INSERT INTO order_items (order_id, dish_id, quantity) VALUES (?, ?, ?)',
        [orderResult.insertId, dishId, quantity]
      );
    }

    await connection.commit();

    res.send(page('Заказ создан', `
      <h2>Заказ создан</h2>
      <p>Ваш заказ №${orderResult.insertId} принят.</p>
      <p><a href="/client">Сделать еще заказ</a></p>
    `));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

module.exports = router;
