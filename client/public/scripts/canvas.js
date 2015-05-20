$(function () {
  var socket = io();  // empty argument --> takes ip of serving http server as default, MAGIC!!
  var ownPlayer;      // Holds the own players player object
  var players = {};   // Contains all player objects (incl. own)
  var groups = {};    // Contains all group objects
  // Set up stage (canvas)
  var stage = new createjs.Stage('mycanvas');



  var update = true;  // Whenever we set this to true, in the next tick
                      // the stage will be updated. This way we only update
                      // the canvas if there is a change.

  stage.enableMouseOver();
  createjs.Touch.enable(stage);


  // Register 'tick' function, which is called multiple times
  // depending on framerate. We update the canvas, if update is
  // set to true and set it back to false. This way we avoid
  // expensive screen updates.
  createjs.Ticker.addEventListener("tick", function (event) {
    if (update) {
      //update = false; // Only update once
      stage.update(event);
    }
  });

  // Define sprite sheet for player figure, with all animations
  var playerSpriteSheet = new createjs.SpriteSheet({
    images: ["images/player.png"],
    frames: {width: 32, height: 50, regX: 16, regY: 25, count: 16},
    animations: {
      "standdown": 0,
      "standleft": 4,
      "standright": 8,
      "standup": 12,
      "down": [1, 3, "standdown", 0.4],
      "left": [5, 7, "standleft", 0.4],
      "right": [9, 11, "standright", 0.4],
      "up": [13, 15, "standup", 0.4]
    }
  });

  /*
   Class Player
   Class representing any player in the room/game.

   @member: id         The id of the player, set to the id given by the socket
   @member: username   Readable name of user (string)
   @member: shape      Shape object generated by create.js. (http://www.createjs.com/EaselJS)
   Represents object on screen. Currently a simple circle.


   @fun: getPos                Returns position vector in format { x:356, y:689 }
   @fun: setPos(xpos, ypos)    Set's the position of the shape and updates screen.
   @fun: remove()              Removes the shape of the player and un-registers it
   from the 'players' map. Called when other players leave.

   */
  function Player(id, xpos, ypos, username, room) {
    if (id === undefined) return;
    this.id = id;
    this.room = room;
    this.username = username;
    this.shape = new createjs.Sprite(playerSpriteSheet, "standdown");
    this.shape.player = this;
    stage.addChild(this.shape);
    this.setPos(xpos, ypos);
  }

  Player.prototype = {
    constructor: Player,
    getPos: function () {
      return {x: this.shape.x, y: this.shape.y};
    },
    setPos: function (xpos, ypos) {
      this.shape.x = xpos;
      this.shape.y = ypos;
      update = true;
    },
    remove: function () {
      var id = this.id;
      stage.removeChild(this.shape);
      delete players[id];
      update = true;

    },
    moveTo: function (xpos, ypos) {
      var oldx = this.shape.x;
      var oldy = this.shape.y;
      if (xpos - oldx > 0) {                       // Moved right
        this.playIfNotPlaying("right");
      } else if (xpos - oldx < 0) {                // Moved left
        this.playIfNotPlaying("left");
      } else if (ypos - oldy < 0) {                // Moved up
        this.playIfNotPlaying("up");
      } else if (ypos - oldy > 0) {                // Moved down
        this.playIfNotPlaying("down");
      }

      // Disallow escaping from the canvas
      if(xpos > 0 && xpos < 1000 && ypos > 0 && ypos < 1000 ){
        this.setPos(xpos, ypos);
      }


    },
    playIfNotPlaying: function (direction) {
      if (this.shape.currentAnimation != direction) {
        this.shape.gotoAndPlay(direction);
      }
    }
  };

  function Group(name, description, room) {
    this.name = name;
    this.description = description;
    this.room = room;
    this.players = {};
  }

  Group.prototype = {
    constructor: Group,
    addPlayer: function (player) {
      this.players[player.id] = player;
    },
    removePlayer: function (playerID){
      delete this.players[playerID];
    }
  };
  /*
   Class OwnPlayer extends Player
   Class representing own player object. Inherits all functionality from Player class
   but adds mouse drag and drop functionality, so the player can move the object around.

   Also emits any position change back to the server, so other players receive the update.
   */
  function OwnPlayer(id, xpos, ypos, username, room) {
    this.base = Player;
    this.base(id, xpos, ypos, username, room); // Call superclass constructor

    // Setup mouse handlers
    this.shape.on("mousedown", function (evt) {
      this.parent.addChild(this);
      this.offset = {x: this.x - evt.stageX, y: this.y - evt.stageY};
    });
    this.shape.on('pressmove', function (evt) {
      this.player.moveTo(evt.stageX + this.offset.x, evt.stageY + this.offset.y);
    });

    //setup key event handling, to be able to walk with the keys
    var that = this;
    $(document).keydown(function (event) {
      var step = 10;
      switch (event.keyCode) {
        case 37:
          that.moveTo(that.getPos().x - step, that.getPos().y);
          break;
        case 38:
          that.moveTo(that.getPos().x, that.getPos().y - step);
          break;
        case 39:
          that.moveTo(that.getPos().x + step, that.getPos().y);
          break;
        case 40:
          that.moveTo(that.getPos().x, that.getPos().y + step);
      }
    });


  }

  OwnPlayer.prototype = new Player();

  // Overwrite the setPos function (emit new position along with redraw)
  OwnPlayer.prototype.setPos = function (xpos, ypos) {
    this.shape.x = xpos;
    this.shape.y = ypos;
    update = true;
    var pos = this.getPos();
    pos.roomname = this.room;
    socket.emit('updatepos', pos);
  };

  /**
   * Incoming socket call: called when the server sends a new update.
   * Contains data about 1 player with id, username, x and y.
   */
  socket.on('update', function (newPos) {
    // We ignore update about ourself. But could be used to verify if
    // the server is in sync with own position. E.g. too big delta ->
    // our position is resetted to the server's state.
    if (newPos.id === socket.id) return;

    // Update player if we know about him, else create a new game object
    if (newPos.id in players) {
      players[newPos.id].moveTo(newPos.x, newPos.y);
    } else {
      players[newPos.id] = new Player(newPos.id, newPos.x, newPos.y, newPos.username, newPos.room);
      announceArrival(newPos.username);
    }

  });

  // Group creation
  socket.on('groupcreated', function (group) {
    var groupname = group.name.replace(/\s/g, '');
    groups[groupname] = new Group(group.name, group.description, group.roomname);

    var groupRadius = 100;

    var groupCloud  = new createjs.Bitmap("images/cloud.png")
    groupCloud.scaleX = 2
    groupCloud.scaleY = 2;

    groupCloud.x = group.groupPos.x -groupRadius;
    groupCloud.y = group.groupPos.y -groupRadius;
    stage.addChildAt(groupCloud,0);
    stage.update();

    // Create the DOM for Groups
    var list = $('<li>', {
      class: 'list-group-item'
    });
    var title = $('<h5>', {
      text: group.name
    });

    var tooltip = $('<span>', {
      class: 'glyphicon glyphicon-info-sign',
      'aria-hidden': 'true',
      title: group.description,
      'data-toggle': 'tooltip',
      'data-placement': 'right'
    });
    title.append(tooltip);
    list.append(title);

    list.append($('<ul>', {
      class: 'group-members',
      id: groupname
    }));
    $('#grouplist').append(list);
    // Initialize tooltip
    $('[data-toggle="tooltip"]').tooltip();
  });

  socket.on('joinedgroup', function (info) {
    var groupname = info.name.replace(/\s/g, '');

    //announce on the chat that the player has joined the group
    announceJoinGroup(info.username,groupname)

    if (info.addDefault && $('#'+info.id).length==0) {
      $('#' + info.name).append($('<li>', {
        id: info.id,
        text: info.username
      }));
    } else {
      // Remove Player from default Group
      $('#default').find('#' + info.id).remove();
      // Add Player to Group
      $('#' + groupname).append($('<li>', {
        id: info.id,
        text: getUsernameById(info.id)
      }));
    }

    // Add Player to Group Object
    var group = groups[groupname];
    if (group) {
      group.addPlayer(players[info.id]);
    }
  });

  var getUsernameById = function (socketId) {
    for (var playerid in players) {
      if (playerid = socketId) {
        var usr = players[playerid];
        return usr.username;
      }
    }
  };
  socket.on('leftgroup', function (info) {
    var groupname = info.name.replace(/\s/g, '');

    //announce on the chat that the player has left the group
    announceLeaveGroup(info.username,groupname)

    // Remove username from group
    $('#' + groupname).find('#' + info.id).remove();

    // Add Player to default
    $('#default').append($('<li>', {
      id: info.id,
      text: getUsernameById(info.id)
    }));

    // Remove Player to Group Object
    var group = groups[groupname];
    if (group) {
      group.removePlayer(info.id);
    }
  });

  socket.on('errormessage', function (msg) {
    alert(msg);
  });

  $('#createGroupButton').click(function () {
    var name = $('#groupName').val();
    var description = $('#groupDescription').val();
    if (name == "") {
      alert('Please enter a group name')
    } else {
      socket.emit('creategroup', {roomname: ownPlayer.room, groupname: name, groupdescription: description});
      $('#groupName').val('');
      $('#groupDescription').val('');
    }
  });

  /*Get Groups*/
  $('#getGroupsButton').click(function () {
    console.log('get group');
    socket.emit('getgroups');
    console.log('get group2');
  });

  /**
   * Incoming socket call: called when a player leaves. Removes him
   * from the screen and map.
   */
  socket.on('remove', function (playerID) {
    if (players[playerID]) {
      var player = players[playerID];
      announceLeave(player.username);
      players[playerID].remove();

      // Remove out of groups
      $('#' + playerID).remove();

      // Remove from Group Object
      for(var groupname in groups){
        var group = groups[groupname];
        group.removePlayer(playerID);
      }
    }
  });

  var announceJoinGroup = function (username, group) {
     // $('#chatlist').append('<li tabindex="1"><p class="triangle-obtuse top">' + username + ' joined the group ' + group + '</li>');
      $('li').last().focus();
      $('#chatinput').focus();
  };

  var announceLeaveGroup = function (username, group) {
      //$('#chatlist').append('<li tabindex="1"><p class="triangle-obtuse top">' + username + ' left the group ' + group + '</li>');
      $('li').last().focus();
      $('#chatinput').focus();
  };


  var announceArrival = function (username) {
   // $('#chatlist').append('<li tabindex="1"><p class="triangle-obtuse top">' + username + ' entered the room! </li>');
    $('li').last().focus();
    $('#chatinput').focus();
  };

  var announceLeave = function (username) {
   // $('#chatlist').append('<li tabindex="1"><p class="triangle-obtuse top">' + username + ' left the room! </li>');
    $('li').last().focus();
    $('#chatinput').focus();
  };

  //Chat logic

  $('#chatinput').keydown(function (event) {
    if (event.keyCode == 13) { //ENTER button
      $('#chatbutton').click();
    }
  });

  $('#chatbutton').click(function () {
    var text = $('#chatinput').val();
    sendChatMessage(text);
    addOwnChatMessage(text);
  });

  /**
   * send the chatMessage out through socketIO
   */
  var sendChatMessage = function (messagetext) {
    var chatMessage = {
      username: ownPlayer.username,
      text: messagetext,
      roomname: ownPlayer.room
    };
    socket.emit('chatmessage', chatMessage);
  };

  var addOwnChatMessage = function (message) {
    //$('#chatlist').append('<li tabindex="1"><p class="triangle-isosceles left">' + message + '</li>');
    $('#chatlist').append('<li tabindex="1">Me: ' + message + '</li>');
    $('li').last().focus();
    $('#chatinput').val('');
    $('#chatinput').focus();
  };

  /**
   * Adds a chat message that came in on the socket to the chat display
   */
  var addForeignChatMessage = function (chatMessage) {
    var text = chatMessage.text;
    var user = chatMessage.username;

    //$('#chatlist').append('<li tabindex="1"><p class="triangle-right right"><b>' + user + ': </b>' + text + '</p></li>');
    $('#chatlist').append('<li tabindex="1"><b>' + user + ': </b>' + text + '</li>');
    $('li').last().focus();
    $('#chatinput').focus();

  };

  /**
   * Handles incoming chatMessages on the sockets
   */
  socket.on('chatmessage', function (chatMessage) {
    var user = chatMessage.username;
    if (!(user === ownPlayer.username)) { //ignore my own messages
      addForeignChatMessage(chatMessage);
    }
  });


  /**
   *  Login Formula clicked: Hide form, show canvas and create new game object.
   *  */
  $('#joinform').submit(function (e) {
    //remove title to gain more vertical space
    $('#title').hide();

    e.preventDefault();
    var param = {};
    param.username = $('#username').val();
    param.room = $('#room').val();
    param.x = 500;  // Spawn position
    param.y = 500;
    socket.emit('login', param);
    $('#joinform').hide("fade", function () { //hide login form and show canvas and sidepanels
      $('#mycanvas').fadeIn(200);
      $('.row').fadeIn(200);
      ownPlayer = new OwnPlayer(socket.id, param.x, param.y, param.username, param.room);
      players[ownPlayer.id] = ownPlayer; // Save game object in global map of player objects.
    });
  });


});