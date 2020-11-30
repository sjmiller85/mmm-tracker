const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const config = require('./config');

let levels = []; // all levels in the queue
let cLevel = {}; // current selected level
let levelsChange = false; // has there been a change to the levels variable?
let cLevelChange = false; // has there been a change to the cLevel variable?
let queueOpenChange = false; // has the queue been changed to opened or closed
let socketFunctions = {};

app.get('/queue/add/:levelID/:user/:userLevel', (req, res) => {
  // check to make sure it's a valid request
  if (!req.params.levelID || !req.params.user || !req.params.userLevel) {
    res.status(400).send('Missing URL parameters');
    return;
  }

  if (!config.queueOpen) {
    res.status(500).send('Queue is closed');
    return;
  }

  const levelID = parseInt(req.params.levelID);

  // check if it's already been added to the queue
  let duplicate = false;
  levels.forEach((val, i) => {
    if (val.id === levelID) {
      duplicate = true;
    }
  });

  if (duplicate) {
    res
      .status(500)
      .send(`Level id: ${levelID} has already been added to the queue.`);
    return;
  }

  // get level details from the MMM api
  axios
    .get(`https://megamanmaker.com/megamaker/level/info/${levelID}`)
    .then((response) => {
      const d = response.data;

      if (d.error) {
        res.status(404).send(`No level with id ${levelID} found`);
        return;
      }

      if (config.reqPosScore && d.score < 0) {
        res.status(500).send('Levels must have a score of at least zero (0)');
        return;
      }

      levels.push({
        id: d.id,
        name: d.name,
        user: d.username,
        created: new Date(d.date).toLocaleDateString('en-us'),
        score: d.score,
        plays: d.downloads,
        submitter: req.params.user,
        submitterLevel: req.params.userLevel,
      });
      socketFunctions.changeQueueCount();

      console.log(`added level id: ${d.id} to the queue`);
      res
        .status(200)
        .send(`${req.params.user} added "${d.name}" to the queue!`);
    });
});

app.get('/queue/next/:random/:sub', (req, res) => {
  const random = req.params.random == 'true';
  const sub = req.params.sub == 'true';
  const getLevel = (levels) => {
    // helper function to get a level from an array of levels
    let newLevel = {};
    if (random) {
      newLevel = levels[Math.floor(Math.random() * levels.length)];
    } else {
      newLevel = levels[0];
    }
    return newLevel;
  };

  if (cLevel.id) {
    // remove old level from queue
    levels.forEach((val, i) => {
      if (cLevel.id == val.id) {
        levels.splice(i, 1);
        console.log(`removed ${val.name} from the queue`);
        socketFunctions.changeQueueCount();
      }
    });
  }

  console.log(`levels.length: ${levels.length}`);
  if (levels.length === 0) {
    cLevel = {};
    socketFunctions.changeCurrentLevel();
    res.status(500).send('No levels in the queue');
    return;
  }

  if (sub) {
    // create a sub only array of levels
    let subLevels = [];
    levels.forEach((val, i) => {
      if (val.submitterLevel === 'subscriber') {
        subLevels.push(val);
      }
    });
    cLevel = getLevel(subLevels);
  } else {
    cLevel = getLevel(levels);
  }
  socketFunctions.changeCurrentLevel();

  console.log(`next level: ${cLevel.name}`);
  res
    .status(200)
    .send(`Next level: "${cLevel.name}", submitted by: ${cLevel.submitter}`);
});

app.get('/queue/current', (req, res) => {
  res.sendFile(__dirname + '/level.html');
});

app.get('/queue/clear', (req, res) => {
  levels = [];
  cLevel = {};

  socketFunctions.changeQueueCount();
  socketFunctions.changeCurrentLevel();

  res.status(200).send('Queue has been cleared');
});

app.get('/queue/open/:open', (req, res) => {
  const open = req.params.open === 'true';
  config.queueOpen = open;
  socketFunctions.changeQueueStatus();

  res.status(200).send(`Queue set to ${open ? 'open' : 'closed'}`);
});

io.on('connection', (socket) => {
  console.log('new connection!');
  if (!cLevel.id) {
    socket.emit('no level');
  } else {
    socket.emit('new level', cLevel);
  }

  // Initial queue count emit
  socket.emit('queue count', levels.length);
  socket.emit('queue open', config.queueOpen ? 'open' : 'closed');

  socket.on('disconnect', () => {
    console.log('connection closed!');
  });

  socketFunctions.changeQueueCount = () => {
    socket.emit('queue count', levels.length);
  };
  socketFunctions.changeCurrentLevel = () => {
    socket.emit('new level', cLevel);
  };
  socketFunctions.changeQueueStatus = () => {
    socket.emit('queue open', config.queueOpen ? 'open' : 'closed');
  };
});

http.listen(3000, () => {
  console.log('Server listening on port: 3000');
});
