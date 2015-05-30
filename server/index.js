var app = exports = module.exports = {};

app.init = function (server) {
  var that = this;
  app.io = require('socket.io')(server);

  // Helping function to pretty shorten a long string
  String.prototype.trunc = String.prototype.trunc ||
  function(n){
    return this.length>n ? this.substr(0,n-3)+'...' : this;
  };


  var canvasWidth = 1000;
  var canvasHeight = 1000;

  var groupRadius = 125;
  var groupPositions = [
    {
      x: 0 + groupRadius,
      y: 0 + groupRadius
    },
    {
      x: canvasWidth - groupRadius,
      y: 0 + groupRadius
    },
    {
      x: 0 + groupRadius,
      y: canvasHeight - groupRadius
    },
    {
      x: canvasWidth / 2,
      y: 0 + groupRadius
    },
    {
      x: canvasWidth - groupRadius,
      y: canvasHeight / 2
    },
    {
      x: canvasWidth / 2,
      y: canvasHeight - groupRadius
    },
    {
      x: 0 + groupRadius,
      y: canvasHeight / 2
    }
  ];

  /*
   Class Group
   Class representing any group in the room.
   */

  function Group(name, description, roomname) {
    if (name === undefined) return;
    this.name = name;
    this.description = description;
    this.roomname = roomname;
    this.groupPos = this.setGroupPos();
  }

  Group.prototype = {
    constructor: Group,
    setGroupPos: function () {
      for (var i = 0; i < 8; i++) {
        var taken = false;
        for (var groupname in app.io.nsps['/'].adapter.rooms[this.roomname].groups) {
          var group = app.io.nsps['/'].adapter.rooms[this.roomname].groups[groupname];
          if (group.groupPos == groupPositions[i]) {
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

  function getGroup(room, x, y) {
    for (var groupname in room.groups) {
      var group = room.groups[groupname];
      var inX = group.groupPos.x - groupRadius < x && group.groupPos.x + groupRadius > x;
      var inY = group.groupPos.y - groupRadius < y && group.groupPos.y + groupRadius > y;
      if (inX && inY) {
        return group;
      }
    }
    return null;
  }

  app.io.on('connect', function (socket) {
    /* Leave 'own' group. Socket.io by default joins room with the name of the socket id */
    socket.leave(socket.id);

    /* Send available rooms */
    socket.emit('roomUpdate', Object.keys(socket.adapter.rooms));

    // This later holds room specific information such as x,y positions and the current group
    socket.roomdata = {};

    /* When a user creates a group */
    socket.on('creategroup', function (data) {

      // normalize the groupname hardcore
      // data.groupname = data.groupname.replace(/^[^a-zA-Z]+/, "");
      // data.groupname = data.groupname.replace(/[^a-zA-Z0-9]+/g, "");

      // normalize the groupname rather softly
      data.groupname = data.groupname.replace(/[\s]+/g, "");

      var match = /^[a-zA-z][a-zA-Z0-9]*$/.test(data.groupname);

      var exists = false;
      for (var name in socket.adapter.rooms[data.roomname].groups) {
        if (name == data.groupname) {
          exists = true;
        }
      }

      if (exists) {
        socket.emit('errormessage', 'Group ' + data.groupname + ' already exists!');
        return;
      }

      // Create new Group object
      var newGroup = new Group(data.groupname, data.groupdescription, data.roomname);
      if (!newGroup.groupPos) {
        socket.emit('errormessage', 'No space for more groups!');
        return;
      }

      if (!match) {
        socket.emit('errormessage', data.groupname + ' is an invalid group name.\nOnly letters & numbers are allowed and the group name has to start with a letter.');
        return;
      }

      // Create new group in the room
      var currentRoom = socket.adapter.rooms[data.roomname];
      currentRoom.groups[data.groupname] = newGroup;

      // Send information about new group to all players in room
      app.io.to(data.roomname).emit('groupcreated', newGroup);

      // Join every player that stands in that space of the new group
      for (var socketId in currentRoom) {
        if (typeof currentRoom[socketId] != 'object') {
          var usr = that.io.sockets.connected[socketId];
          var x = usr.roomdata[data.roomname].x;
          var y = usr.roomdata[data.roomname].y;
          var potentialGroup = getGroup(currentRoom, x, y);
          if (potentialGroup !== null) {
            app.io.to(data.roomname).emit('joinedgroup', {id: socketId, name: potentialGroup.name, username: usr.username});
          }
        }
      }




    });
    // Delete group, data includes roomname and groupname
    socket.on('deletegroup', function (data) {
      var room = socket.adapter.rooms[data.roomname];
      var empty = true;
      // Go through players to see if anyone is in this particular group
      for (var socketId in room) {
        // only socketIds, no groups property
        if (typeof room[socketId] != 'object') {
          var usr = that.io.sockets.connected[socketId];
          // check if player is in this group
          var usrgroup = usr.roomdata[data.roomname].mygroup;
          if (usrgroup && usrgroup.name == data.groupname) {
            empty = false;
            break;
          }
        }
      }

      if(empty) {
        delete room.groups[data.groupname];
        // Emit to other players that this group was deleted
        app.io.to(data.roomname).emit('groupdeleted', data);
      } else {
        // group stays... TODO: send a troll-warning to socket?
      }
    });

    /* When a user logs in */
    socket.on('login', function (data) {
      socket.join(data.room);
      socket.roomdata[data.room] = {x: data.x, y: data.y};

      // Create empty groups container if the room was newly created
      if (!socket.adapter.rooms[data.room].groups) {
        socket.adapter.rooms[data.room].groups = {};
      }
      socket.username = data.username.trunc(20);

      // Send this new player's position to everyone
      var newPos = {id: socket.id, username: socket.username, room: data.room, x: data.x, y: data.y};
      app.io.to(data.room).emit('update', newPos);

      // Send back information about all other players
      var room = socket.adapter.rooms[data.room];
      for (var socketId in room) {
        if (typeof room[socketId] != 'object') {
          var usr = that.io.sockets.connected[socketId];
          var pos = {
            id: usr.id,
            username: usr.username,
            room: data.room,
            x: usr.roomdata[data.room].x,
            y: usr.roomdata[data.room].y
          };
          socket.emit('update', pos);
        }
      }

      // Send back information about all groups
      var groups = socket.adapter.rooms[data.room].groups;
      for (var groupname in groups) {
        var group = socket.adapter.rooms[data.room].groups[groupname];
        socket.emit('groupcreated', group);
      }

      // Let the joining player know which players are in which groups
      console.log(room);
      for (var socketId in room) {
        // only socketIds, no groups property
        if (typeof room[socketId] != 'object') {
          var usr = that.io.sockets.connected[socketId];
          // check if player is in a group
          if (usr.roomdata[data.room].mygroup) {
            var group = usr.roomdata[data.room].mygroup;
            // Player (socketId) is in a group. Inform the joining player (socket) about this
            socket.emit('joinedgroup', {id: socketId, name: group.name, username: usr.username});
          } else {
            // Player (socketId) is in the default group. Inform the joining player (socket) about this
            socket.emit('joinedgroup', {id: socketId, name: 'default', username: usr.username, addDefault: true});
          }
        }
      }

      // Add Player to default Group
      // app.io.to(data.room).emit('joinedgroup', {id: socket.id, name: 'default', username: socket.username, addDefault: true});


    });

    /* When a user logs out */
    socket.on('disconnect', function () {
      // Leave all groups before disconnecting
      for (roomname in socket.roomdata) {
        var room = socket.roomdata[roomname];
        // Leave group if player is in one
        if (room.mygroup) {
          app.io.to(roomname).emit('leftgroup', {id: socket.id, name: room.mygroup.name, username: socket.username});
        }
      }

      // Announce player's removal
      app.io.sockets.emit('remove', socket.id);

      // Normally socket.io deletes garbage collects empty rooms on disconnect,
      // but since we manually added a 'groups' object, we have to manually clean
      // the room.
      for (roomname in socket.adapter.rooms) {
        var room = socket.adapter.rooms[roomname];
        if (Object.keys(room).length <= 1 && room.hasOwnProperty('groups')) {
          delete socket.adapter.rooms[roomname];
        }
      }
    });

    /* When a user sends a position update */
    socket.on('updatepos', function (pos) {
      var oldPos = {
        x: socket.roomdata[pos.roomname].x,
        y: socket.roomdata[pos.roomname].y
      };
      socket.roomdata[pos.roomname].x = pos.x;
      socket.roomdata[pos.roomname].y = pos.y;

      var room = socket.adapter.rooms[pos.roomname];
      var oldGroup = getGroup(room, oldPos.x, oldPos.y);
      var newGroup = getGroup(room, pos.x, pos.y);

      var joinedgroup = false;
      var leftgroup = false;
      if (oldGroup == null && newGroup != null) {
        socket.roomdata[pos.roomname].mygroup = newGroup;
        joinedgroup = true;
      }
      if (oldGroup != null && newGroup == null) {
        socket.roomdata[pos.roomname].mygroup = null;
        leftgroup = true;
      }

      // Broadcast new position to all other player in the same room
      var newPos = {id: socket.id, username: socket.username, room: pos.roomname, x: pos.x, y: pos.y};
      app.io.to(pos.roomname).emit('update', newPos);

      if (joinedgroup) {
        app.io.to(pos.roomname).emit('joinedgroup', {id: socket.id, name: newGroup.name, username: newPos.username});

      }
      if (leftgroup) {
        app.io.to(pos.roomname).emit('leftgroup', {id: socket.id, name: oldGroup.name, username: newPos.username});
      }

    });

    /* when a chat message arrives */
    socket.on('chatmessage', function (message) {
      app.io.to(message.roomname).emit('chatmessage', message);
    });


  });
}