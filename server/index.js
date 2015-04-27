var app = exports = module.exports = {};

app.init = function (server) {
  var that = this;
  app.io = require('socket.io')(server);

  var groups = {};
  var groupRadius = 50;
  var groupPositions = [
    {
      x: 50,
      y: 50
    },
    {
      x: 550,
      y: 50
    },
    {
      x: 550,
      y: 550
    },
    {
      x: 50,
      y: 550
    }
  ];

  /*
   Class Group
   Class representing any group in the room.
   */

  function Group(name, description) {
    if (name === undefined) return;
    this.name = name;
    this.description = description;
    this.groupPos = this.setGroupPos();
  }

  Group.prototype = {
    constructor: Group,
    setGroupPos: function () {
      for (var i = 0; i < 8; i++) {
        var taken = false;
        for (var j in groups) {
          if (groups[j].groupPos == groupPositions[i]) {
            taken = true;
          }
        }
        if (!taken) {
          return groupPositions[i];
        }
      }
      return null;
    }
  };

  function getGroup(x, y) {
    for (var j in groups) {
      var distance = Math.sqrt(Math.pow(groups[j].groupPos.x - x, 2) + Math.pow(groups[j].groupPos.y - y, 2));
      if (distance <= groupRadius) {
        return groups[j];
      }
    }
    return null;
  }

  app.io.on('connect', function (socket) {
    /* Send available rooms */
    var rooms = socket.adapter.rooms;
    var sids = socket.adapter.sids;
    var roomNames = [];

    for (var key in rooms) {
      if (rooms.hasOwnProperty(key)) {
        var room = rooms[key];
        if (!sids.hasOwnProperty(key)) {
          roomNames.push(key);
        }
      }
    }
    socket.emit('roomUpdate', roomNames);

    /*get groups*/
    socket.on('getgroups', function (data) {
      socket.emit('listGroups', groups);
      return;
    });


    /* When a user creates a group */
    socket.on('creategroup', function (data) {
      var exists = false;
      for (var name in groups) {
        if (name == data.name) {
          exists = true;
        }
      }
      if (exists) {
        socket.emit('groupcreationfailed', 'Group already exists!');
        return;
      }
      var newGroup = new Group(data.name, data.description);
      if (!newGroup.groupPos) {
        socket.emit('groupcreationfailed', 'No space for more groups!');
        return;
      }
      groups[newGroup.name] = newGroup;
      for (index = 0, len = socket.rooms.length; index < len; ++index) {
        var room = socket.rooms[index];
        if (!(room === socket.id)) {
          app.io.to(room).emit('groupcreated', newGroup);
        }
      }
    });

    /* When a user logs in */
    socket.on('login', function (data) {
      socket.join(data.room);
      socket.username = data.username;
      socket.x = data.x;
      socket.y = data.y;

      // Send this new player's position to everyone
      var newPos = {id: socket.id, username: socket.username, x: socket.x, y: socket.y};
      app.io.to(data.room).emit('update', newPos);
      // Send back information about all other players
      var room = app.io.nsps['/'].adapter.rooms[data.room];

      for (var socketId in room) {
        var usr = that.io.sockets.connected[socketId];
        var pos = {id: usr.id, username: usr.username, x: usr.x, y: usr.y};
        socket.emit('update', pos);
      }

    });

    /* When a user logs out */
    socket.on('disconnect', function () {
      app.io.sockets.emit('remove', socket.id);
    });

    /* When a user sends a position update */
    socket.on('updatepos', function (pos) {
      var oldPos = {};
      oldPos.x = socket.x;
      oldPos.y = socket.y;
      socket.x = pos.x;
      socket.y = pos.y;

      var oldGroup = getGroup(oldPos.x, oldPos.y);
      var newGroup = getGroup(socket.x, socket.y);

      var newPos = {id: socket.id, username: socket.username, x: socket.x, y: socket.y};

      var joinedgroup = false;
      var leftgroup = false;
      if (oldGroup == null && newGroup != null) {
        socket.group = newGroup;
        joinedgroup = true;
      }
      if (oldGroup != null && newGroup == null) {
        socket.group = null;
        leftgroup = true;
      }

      // Broadcast new position to all rooms except own 'private' room
      // socket.io by default joins a room with the name of the socket id
      // We don't need that -> Performance gain.

      // Also think about disallowing multiple rooms for one socket. Doesn't really make
      // sense since he/she would move around the same path in multiple rooms.

      for (index = 0, len = socket.rooms.length; index < len; ++index) {
        var room = socket.rooms[index];
        if (!(room === socket.id)) {
          app.io.to(room).emit('update', newPos);
          if (joinedgroup) {
            app.io.to(room).emit('joinedgroup', {id: socket.id, name: newGroup.name});
          }
          if (leftgroup) {
            app.io.to(room).emit('leftgroup', {id: socket.id, name: oldGroup.name});
          }
        }
      }
    });

    /* when a chat arrives */
    socket.on('chatmessage', function (message) {
      for (index = 0, len = socket.rooms.length; index < len; ++index) {
        var room = socket.rooms[index];
        if (!(room === socket.id)) {
          app.io.to(room).emit('chatmessage', message);
        }
      }
    });


  });
}