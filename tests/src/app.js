const express = require('express')
const app = express()

app.get('/cookie', function(req, res) {
  res.send(`${req.headers.cookie}`)
})

app.get('/*', function(req, res) {
  res.send('hello world')
})

module.exports = app
