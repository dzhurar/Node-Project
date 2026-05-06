const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');

const { router: authRoutes } = require('./src/routes/auth');
const dishRoutes = require('./src/routes/dishes');
const orderRoutes = require('./src/routes/orders');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret123',
  resave: false,
  saveUninitialized: false
}));

app.use(authRoutes);
app.use(dishRoutes);
app.use(orderRoutes);

const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running: http://localhost:${PORT}/login`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the old node process or use another port.`);
    process.exit(1);
  }

  throw error;
});
