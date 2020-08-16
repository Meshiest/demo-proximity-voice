const fs = require('fs');

const https = require('https');
const express = require('express');
const { ExpressPeerServer } = require('peer');

const { v4: uuidv4 } = require('uuid');

// setup ssl
const SSL_CONFIG = {
  cert: fs.readFileSync('./cert.pem'),
  key: fs.readFileSync('./key.pem'),
};

// setup express, socket io, and peerjs
const app = express();
const server = https.createServer(SSL_CONFIG, app);
const io = require('socket.io')(server);
const peerServer = ExpressPeerServer(server, {debug: true});

// use peerjs with express
app.use('/peerjs', peerServer);
app.use(express.static('.'));

// send index file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const throttle = (func, limit) => {
  let lastFunc
  let lastRan
  return function() {
    const context = this
    const args = arguments
    if (!lastRan) {
      func.apply(context, args)
      lastRan = Date.now()
    } else {
      clearTimeout(lastFunc)
      lastFunc = setTimeout(function() {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(context, args)
          lastRan = Date.now()
        }
      }, limit - (Date.now() - lastRan))
    }
  }
}

// track which users are connected
const users = [];

// handle socket connection
io.on('connection', socket => {
  const id = uuidv4();
  const pos = {x: 0, y: 0};
  users.push({ id, socket, pos });
  console.log('user connected', id);

  // tell user his or her id
  socket.emit('id', id);

  // tell the other users to connect to this user
  socket.broadcast.emit('join', id, pos);
  socket.emit('players', users
    .filter(u => u.id !== id)
    .map(u => ({id: u.id, pos: u.pos}))
  );

  const emitPos = throttle((x, y) => {
    socket.broadcast.emit('pos', id, {x, y});
  }, 25);

  socket.on('pos', (x, y) => {
    // ignore non-number input
    if (typeof x !== 'number' || typeof y !== 'number') return;

    // clamp pos
    x = Math.max(Math.min(200, x), -200);
    y = Math.max(Math.min(200, y), -200);
    pos.x = x;
    pos.y = y;

    // emit the position, throttled
    emitPos(x, y);
  });

  // user disconnected
  socket.on('disconnect', () => {
    console.log('user disconnected', id);
    // let other users know to disconnect this client
    socket.broadcast.emit('leave', id);

    // remove the user from the users list
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users.splice(index, 1);
    }
  });
});

peerServer.on('connection', peer => {
  console.log('peer connected', peer.id);
});

peerServer.on('disconnect', peer => {
  console.log('peer disconnected', peer.id);
});

server.listen(3000);
