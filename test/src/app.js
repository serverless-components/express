'use strict';

const express = require('express');

const app = express();

app.get('/cookie', (req, res) => {
  res.send(`${req.headers.cookie}`);
});

app.get('/*', (req, res) => {
  res.send('hello world');
});

module.exports = app;
