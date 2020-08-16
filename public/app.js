const $ = document.querySelector.bind(document);
const log = (...args) => logs.innerText += args.join(' ') + '\n';
const GAME_SIZE = 400;

const socket = io();

// throttle a function
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

// setup a spritesheet parser
function initSpritesheet(src, size) {
  // create the image using the given source
  const img = new Image();
  img.src = src;

  // handler to render a single sprite from the spritesheet
  const draw = (tx, ty) => (ctx, {x=0, y=0, rot=0, flipH=false, flipV=false}) => {
    if (ctx.rot !== 0 || ctx.flipH || ctx.flipV) {
      ctx.save();
      ctx.translate(x, y);
      ctx.translate(x, y);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      if (rot !== 0)
        ctx.rotate(rot);
      ctx.drawImage(img, tx * size, ty * size, size, size, - size/2, - size/2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(img, tx * size, ty * size, size, size, x - size/2, y - size/2, size, size);
    }
  };

  // resolve when the image has loaded
  return new Promise((resolve, reject) =>{
    img.onload = () => resolve(draw);
    img.onerror = reject;
  })
}

// setup a canvas
async function initCanvas() {
  const sheet = await initSpritesheet('public/spritesheet.png', 16);
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  ctx.canvas.width = GAME_SIZE;
  ctx.canvas.height = GAME_SIZE;

  return fn => {
    let last = Date.now();

    // render loop
    function render() {
      // calculate time between frames (delta time)
      const now = Date.now();
      const delta = (now - last)/1000;
      last = now;

      // draw background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, GAME_SIZE, GAME_SIZE);
      ctx.save();
      ctx.translate(GAME_SIZE/2, GAME_SIZE/2);

      // run the passed in render fn
      fn(ctx, {sheet, delta, now});

      ctx.restore();

      window.requestAnimationFrame(render);
    };

    window.requestAnimationFrame(render);
  };
}

const myPos = {x: 0, y: 0};
const lastPos = {x: 0, y: 0};
const cursor = {down: false, x: 0, y: 0};
const players = [];

// mouse and touch events
const mouseUpEvent = e => {
  e.preventDefault();
  cursor.down = false;
};

$('#canvas').addEventListener('mousedown', e => {
  e.preventDefault();
  cursor.down = true;
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
});

$('#canvas').addEventListener('mousemove', e => {
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
})

$('#canvas').addEventListener('mouseup', mouseUpEvent);

$('#canvas').addEventListener('touchstart', e => {
  e.preventDefault();
  cursor.down = true;
  if (e.touches.length === 1) {
    const rect = e.target.getBoundingClientRect();
    cursor.x = e.touches[0].pageX - rect.left;
    cursor.y = e.touches[0].pageY - rect.top;
  }
});

$('#canvas').addEventListener('touchmove', e => {
  if (e.touches.length === 1) {
    const rect = e.target.getBoundingClientRect();
    cursor.x = e.touches[0].pageX - rect.left;
    cursor.y = e.touches[0].pageY - rect.top;
  }
})

$('#canvas').addEventListener('touchend', mouseUpEvent);
$('#canvas').addEventListener('touchcancel', mouseUpEvent);

const sendPos = throttle((x, y) => socket.emit('pos', x, y), 25);
// emit position, throttled
function emitPos() {
  if (lastPos.x !== myPos.x && lastPos.y !== myPos.y) {
    sendPos(myPos.x, myPos.y);
    lastPos.x = myPos.x;
    lastPos.y = myPos.y;
  }
}

// render the canvas
initCanvas().then(render => render((ctx, {sheet, delta, now}) => {

  const goalX = !cursor.down ? myPos.x : (cursor.x - GAME_SIZE/2) / 2;
  const goalY = !cursor.down ? myPos.y : (cursor.y - GAME_SIZE/2) / 2;

  if (Math.hypot(goalX - myPos.x, goalY - myPos.y) > 1) {
    const theta = Math.atan2(goalY - myPos.y, goalX - myPos.x);
    myPos.x += Math.cos(theta) * 64 * delta;
    myPos.y += Math.sin(theta) * 64 * delta;
  } else {
    myPos.x = Math.round(myPos.x);
    myPos.y = Math.round(myPos.y);
  }

  emitPos();

  sheet(25, 0)(ctx, {x: myPos.x, y: myPos.y});
  if (cursor.down)
    sheet(20, 14)(ctx, {x: goalX, y: goalY});

  for (const p of players) {
    // smoothly interpolate player position towards the goal position
    p.pos.x += (p.goal.x - p.pos.x) * 5 * delta;
    p.pos.y += (p.goal.y - p.pos.y) * 5 * delta;

    // render the player
    sheet(25, 0)(ctx, {
      x: p.pos.x,
      y: p.pos.y,
    });
  }
}));

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

// get the current user's audio stream
function getAudioStream() {
  return navigator.mediaDevices.getUserMedia({audio: true});
}

// play an audio stream
function playAudioStream(stream, target) {
  // create the video element for the stream
  const elem = document.createElement('video');
  elem.srcObject = stream;
  elem.autoplay = 'autoplay';
  elem.setAttribute('data-peer', target);
  elem.onloadedmetadata = () => elem.play();

  // add it to the stream container
  $('.audiostream-container').appendChild(elem);
}

let id, peer;

// create peer, setup handlers
function initPeer() {
  peer = new Peer(id, {host: location.hostname, port: location.port, path: '/peerjs'});

  peer.on('open', id => { log('My peer ID is:', id); });
  peer.on('disconnected', id => { log('lost connection'); });
  peer.on('error', err => { console.error(err); });

  // run when someone calls us. answer the call
  peer.on('call', async call => {
    log('call from', call.peer);
    call.answer(await getAudioStream());
    receiveCall(call);
  });
}

// start a call with target
async function startCall(target) {
  if (!peer) return;
  const call = peer.call(target, await getAudioStream());
  receiveCall(call);
}

// play the stream from the call in a video element
function receiveCall(call) {
  call.on('stream', stream => {
    // stream.noiseSuppression = true;
    playAudioStream(stream, call.peer);
    log('created stream for', call.peer);
  });
}

// setup peer when user receives id
socket.on('id', async connId => {
  // this only happens if we lose connection with the server
  if (id) {
    log('destroying old identity', id, 'and replacing with', connId);
    peer.destroy();
    peer = undefined;
    return;
  }

  id = connId;
  initPeer();
});

// talk to any user who joins
socket.on('join', (target, pos) => {
  log('calling', target);
  players.push({ id: target, avatar: 0, pos, goal: {x: pos.x, y: pos.y}});
  startCall(target);
});

socket.on('players', existingPlayers => {
  for (const p of existingPlayers) {
    players.push({
      id: p.id,
      avatar: 0,
      pos: p.pos,
      goal: {x: p.pos.x, y: p.pos.y},
    });
  }
});

socket.on('pos', (id, pos) => {
  const player = players.find(p => p.id === id);
  if (player) {
    player.goal.x = pos.x;
    player.goal.y = pos.y;
  }
});

socket.on('leave', target => {
  const elem = $(`[data-peer="${target}"]`);
  log('call dropped from', target);
  if (elem) elem.remove();

  // remove player from players list
  const index = players.findIndex(p => p.id === target);
  if (index > -1) players.splice(index, 1);
});
