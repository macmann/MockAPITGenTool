const express = require('express');
const createError = require('http-errors');
const { object, string } = require('yup');
const { nanoid } = require('nanoid');
const { getAllRoutes, saveRoute } = require('./db');

const router = express.Router();

const routeSchema = object({
  id: string().optional(),
  method: string().required(),
  path: string().required(),
  response: string().required(),
  description: string().optional()
});

router.get('/api/routes', (req, res) => {
  res.json({ routes: getAllRoutes() });
});

router.post('/api/routes', async (req, res, next) => {
  try {
    const payload = await routeSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    const record = saveRoute({
      ...payload,
      id: payload.id || nanoid()
    });
    res.status(201).json(record);
  } catch (err) {
    next(createError(400, err.message));
  }
});

module.exports = router;
