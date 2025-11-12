const path = require('path');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const createError = require('http-errors');
const routerRuntime = require('./router-runtime');
const { getAllRoutes } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/admin', (req, res) => {
  res.render('admin_list', {
    title: 'GUI Mock API',
    routes: getAllRoutes()
  });
});

app.get('/admin/new', (req, res) => {
  res.render('admin_edit', {
    title: 'Create Route',
    route: { method: 'GET', path: '/', response: '{}' }
  });
});

app.use(routerRuntime);

app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status);
  if (req.accepts('json')) {
    res.json({ error: err.message || 'Unknown error' });
    return;
  }

  res.render('admin_edit', {
    title: `Error ${status}`,
    route: null,
    error: err
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`GUI Mock API server listening on port ${PORT}`);
  });
}

module.exports = app;
