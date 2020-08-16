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

// track which users are connected
const users = [];

// handle socket connection
io.on('connection', socket => {
  const id = uuidv4();
  users.push({ id, socket });
  console.log('user connected', id);

  // tell user his or her id
  socket.emit('id', id);

  // tell the other users to connect to this user
  socket.broadcast.emit('join', id);

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
