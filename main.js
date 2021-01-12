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

const calculateQuality = (upvotes, downvotes) => {
  const z = 1.96;
  const n = upvotes + downvotes;
  const p = upvotes / n;

  // Algorithm provided by Goldstorm on MMM's Discord
  const value =
    (p +
      (z * z) / (2 * n) -
      z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n);

  if (n === 0) {
    return 'NA';
  } else if (value > 0 && value < 0.175) {
    return 'AWFUL';
  } else if (value >= 0.175 && value < 0.297) {
    return 'BAD';
  } else if (value >= 0.297 && value < 0.616) {
    return 'AVERAGE';
  } else if (value >= 0.616 && value < 0.769) {
    return 'GOOD';
  } else if (value >= 0.769 && value <= 1) {
    return 'AMAZING';
  }
};

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
    .get(`https://api.megamanmaker.com/level/${levelID}`)
    .then((response) => {
      const d = response.data;

      if (d.message) {
        res.status(404).send(`No level with id ${levelID} found`);
        return;
      }

      if (config.reqPosScore && d.dislikes > d.likes) {
        res.status(500).send('Levels must have more likes than dislikes');
        return;
      }

      levels.push({
        id: d.id,
        name: d.name,
        user: d.authorName,
        created: new Date(d.created).toLocaleDateString('en-us'),
        likes: d.score,
        dislikes: d.dislikes,
        plays: d.downloads,
        difficulty: d.difficulty,
        submitter: req.params.user,
        submitterLevel: req.params.userLevel,
      });

      socketFunctions.changeQueueCount();

      console.log(`added level id: ${d.id} to the queue`);
      res
        .status(200)
        .send(`${req.params.user} added "${d.name}" to the queue!`);
    })
    .catch((err) => {
      res.status(404).send(`No level with id ${levelID} found`);
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
