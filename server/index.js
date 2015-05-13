var app = exports = module.exports = {};

app.init = function (server) {
  var that = this;
  app.io = require('socket.io')(server);


  var canvasWidth = 1000;
  var canvasHeight = 1000;

  var groupRadius = 100;
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
      x: canvasWidth - groupRadius,
      y: canvasHeight - groupRadius
    },
    {
      x: 0 + groupRadius,
      y: canvasHeight - groupRadius
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
      var distance = Math.sqrt(Math.pow(group.groupPos.x - x, 2) + Math.pow(group.groupPos.y - y, 2));
      if (distance <= groupRadius) {
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
      var exists = false;
      for (var name in socket.adapter.rooms[data.roomname].groups) {
        if (name == data.groupname) {
          exists = true;
        }
      }

      if (exists) {
        socket.emit('error', 'Group already exists!');
        return;
      }

      // Create new Group object
      var newGroup = new Group(data.groupname, data.groupdescription, data.roomname);
      if (!newGroup.groupPos) {
        socket.emit('error', 'No space for more groups!');
        return;
      }

      // Create new group in the room
      var currentRoom = socket.adapter.rooms[data.roomname];
      currentRoom.groups[data.groupname] = newGroup;

      // Send information about new group to all players in room
      app.io.to(data.roomname).emit('groupcreated', newGroup);

    });

    /* When a user logs in */
    socket.on('login', function (data) {
      socket.join(data.room);
      socket.roomdata[data.room] = {x: data.x, y: data.y};

      // Create empty groups container if the room was newly created
      if(!socket.adapter.rooms[data.room].groups) {
        socket.adapter.rooms[data.room].groups = {};
      }
      socket.username = data.username;

      // Send this new player's position to everyone
      var newPos = {id: socket.id, username: socket.username, room: data.room, x: data.x, y: data.y};
      app.io.to(data.room).emit('update', newPos);

      // Send back information about all other players
      var room = socket.adapter.rooms[data.room];
      for (var socketId in room) {
        if(typeof room[socketId] != 'object'){
          var usr = that.io.sockets.connected[socketId];
          var pos = {id: usr.id, username: usr.username, room: data.room, x: usr.roomdata[data.room].x, y: usr.roomdata[data.room].y};
          socket.emit('update', pos);
        }
      }

      // Send back information about all groups
      var groups = socket.adapter.rooms[data.room].groups;
      for(var groupname in groups){
        var group = socket.adapter.rooms[data.room].groups[groupname];
        socket.emit('groupcreated', group);
      }

      // for all players(socket objects) in room
      for (var socketId in room) {
        // only socketIds, no groups property
          if(typeof room[socketId] != 'object'){
            var usr = that.io.sockets.connected[socketId];
            // check if player is in a group
            if(usr.roomdata[data.room].mygroup){
              var group = usr.roomdata[data.room].mygroup;
              // if player has room: emit('joinedroom', data)
              app.io.to(data.room).emit('joinedgroup', {id: socketId, name: group.name, username: usr.username});
            }else{
              app.io.to(data.room).emit('joinedgroup', {id: socketId, name: 'default',username: usr.username, addDefault: true});
            }
          }
      }

      // Add Player to default Group
     // app.io.to(data.room).emit('joinedgroup', {id: socket.id, name: 'default', username: socket.username, addDefault: true});


    });

    /* When a user logs out */
    socket.on('disconnect', function () {
      app.io.sockets.emit('remove', socket.id);

      // Normally socket.io deletes garbage collects empty rooms on disconnect,
      // but since we manually added a 'gorups' object, we have to manually clean
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