$(function () {
  var socket = io();  // empty argument --> takes ip of serving http server as default, MAGIC!!
  var ownPlayer;      // Holds the own players player object
  var players = {};   // Contains all player objects (incl. own)
  var groups = {};    // Contains all group objects

  // Set up stage (canvas)
  var stage = new createjs.Stage('mycanvas');

  var groupsContainer = new createjs.Container();        // Bottom layer: Group rectangles
  var otherPlayersContainer = new createjs.Container();  // Second layer: Other player shapes
  var playerContainer = new createjs.Container();       // Top layer: Own player shape

  stage.addChild(groupsContainer);
  stage.addChild(otherPlayersContainer);
  stage.addChild(playerContainer);


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


  var Grayscale = new createjs.ColorMatrixFilter([
    0.30,0.30,0.30,0,0, // red component
    0.30,0.30,0.30,0,0, // green component
    0.30,0.30,0.30,0,0, // blue component
    0,0,0,1,0  // alpha
  ]);

  // Preload the image
  var img = document.createElement("img");
  img.src = "images/player.png";
  img.onload = createSprites;

  var playerSpriteSheet;
  var ownPlayerSpriteSheet;

  // Define sprite sheet for player figure, with all animations
  function createSprites() {
    var bmp = new createjs.Bitmap(img);
    bmp.filters =  [Grayscale];
    bmp.cache(0,0,img.width,img.height);


    playerSpriteSheet = createSprite(bmp.cacheCanvas);
    ownPlayerSpriteSheet = createSprite(img);
  }
  function createSprite(image) {
    return new createjs.SpriteSheet({
      "images": [image],
      frames: {width: 64, height: 100, regX: 32, regY: 50, count: 16},
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
  }




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
  function Player(id, xpos, ypos, username, room, sprite) {
    if (id === undefined) return;
    this.id = id;
    this.room = room;
    this.username = username;
    this.shape = new createjs.Sprite(sprite, "standdown");
    this.shape.player = this;
    this.addToCanvas();
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
      otherPlayersContainer.removeChild(this.shape);
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
    },
    addToCanvas: function() {
      otherPlayersContainer.addChild(this.shape);
    }
  };

  function Group(name, description, room, groupPos, groupShape) {
    this.name = name;
    this.description = description;
    this.room = room;
    this.players = {};
    this.groupPos = groupPos;
    this.groupShape = groupShape;
  }

  Group.prototype = {
    constructor: Group,
    addPlayer: function (player) {
      this.players[player.id] = player;
    },
    removePlayer: function (playerID){
      delete this.players[playerID];
    },
    countPlayers: function(){
      return Object.keys(this.players).length;
    },
    remove: function(){
      if (this.countPlayers() == 0) {
        // Remove from sidebar
        $('#'+this.name).remove();

        // Remove from canvas
        groupsContainer.removeChild(this.groupShape);

        // Announce to others
        var groupinfo = {
          roomname: this.room,
          groupname: this.name
        }
        socket.emit('deletegroup', groupinfo);

        // Try to delete itself (might not work?)
        delete groups[this.name];
      }
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
    this.base(id, xpos, ypos, username, room, ownPlayerSpriteSheet); // Call superclass constructor

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
      var step = 15;
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

  // Overwrite the addToCanvas() function, so that the sprite will be in
  // a higher level than the other players sprites
  OwnPlayer.prototype.addToCanvas = function () {
    playerContainer.addChild(this.shape);
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
      players[newPos.id] = new Player(newPos.id, newPos.x, newPos.y, newPos.username, newPos.room, playerSpriteSheet);
      announceArrival(newPos.username);
    }

  });

  // Group creation
  socket.on('groupcreated', function (group) {
    var groupname = group.name;

    var shownName = groupname.length < 13 ? groupname : groupname.substring(0,10) + "...";
    var container = new createjs.Container();

    // add ugly grey rectangle
    var rect = new createjs.Shape();
    drawRectangle(rect, 'grey', group.groupPos);
    container.addChild(rect);

    // add group name
    var text = new createjs.Text(shownName, "30px Arial", 'white');
    text.x = rect.x + 10;
    text.y = rect.y + 5;
    container.addChild(text);
    groupsContainer.addChild(container);

    groups[groupname] = new Group(group.name, group.description, group.roomname, group.groupPos, container);
    var groupObject = groups[groupname];

    //stage.update();

    // Create the DOM for Groups
    var list = $('<li>', {
      class: 'list-group-item',
      "id": groupname
    });
    var title = $('<h5>', {
      text: 'Group: ' + group.name
    });
    var pmembers = $('<p>', {
      text: 'Members: '
    });
    var desc = $('<p>', {
      class: 'text-muted',
      text: group.description
    });

    var deleteicon = $('<span>', {
      class: 'glyphicon glyphicon-remove deletegroup',
      'aria-hidden': 'true',
      'data-placement': 'right'
    }).click(function() {
      groupObject.remove();
    });

    list.append(deleteicon);
    list.append(title);
    list.append(desc);
    list.append($('<hr>', {class: 'group-hr'}));
    list.append(pmembers);
    list.append($('<ol>', {
      class: 'group-members',
      id: groupname
    }));
    $('#grouplist').append(list);
    // Initialize tooltip
    $('[data-toggle="tooltip"]').tooltip();

  });

  socket.on('groupdeleted', function(data) {
    groups[data.groupname].remove();
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
      $('ol#' + groupname).append($('<li>', {
        id: info.id,
        text: getUsernameById(info.id)
      }));
      $('#' + groupname).find(".deletegroup").hide();
    }

    // Add Player to Group Object
    var group = groups[groupname];
    if (group) {
      group.addPlayer(players[info.id]);
      redraw(group);
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
    $('ol#' + groupname).find('#' + info.id).remove();

    // Add Player to default
    $('#default').append($('<li>', {
      id: info.id,
      text: getUsernameById(info.id)
    }));

    // Remove Player to Group Object
    var group = groups[groupname];
    if (group) {
      group.removePlayer(info.id);
      redraw(group);
    }
    // only show delete button in case there is no player in the group
    if(group.countPlayers() == 0){
      $('#' + groupname).find(".deletegroup").show();
    }
  });

  socket.on('errormessage', function (msg) {
    alert(msg);
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

  //export functionality
  $('#exportButton').click(function (){
      //alert("Hello World!");
      html2canvas( document.getElementById('listinfo') , {
          onrendered: function(canvas) {
              //Canvas2Image.saveAsPNG(canvas, 250, document.getElementById('listinfo').clientHeight);
              //document.body.appendChild(canvas);

              // only jpeg is supported by jsPDF
              var imgData = canvas.toDataURL("image/jpeg", 1.0);
              var pdf = new jsPDF('a6');

              pdf.addImage(imgData, 'JPEG', 15, 40);
              pdf.save("groups.pdf");
          },
          width: 250,
          height: document.getElementById('listinfo').clientHeight
      });
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

  /**
   *  Login Formula clicked: Hide form, show canvas and create new game object.
   *  */
  $('#joinform').submit(function (e) {
    //remove title to gain more vertical space
    $('#title').hide();
    $('div.titlebar').hide();
    $('.footer').hide();

    e.preventDefault();
    var param = {};
    param.username = $('#username').val();
    param.room = $('#room').val();
    param.x = 500;  // Spawn position
    param.y = 500;
    socket.emit('login', param);
    $('#joinform').hide("fade", function () { //hide login form and show canvas and sidepanels
       $('#canvas-wrap').fadeIn(200);
       $('.row').fadeIn(200);
       $('#roombar').fadeIn(200);
       $('#roomtitle').text("Room #" + $('#room').val());
      ownPlayer = new OwnPlayer(socket.id, param.x, param.y, param.username, param.room);
      players[ownPlayer.id] = ownPlayer; // Save game object in global map of player objects.
    });
  });

  function drawRectangle(rect, color, position) {
    var groupRadius = 125;
    rect.graphics.beginFill(color);
    rect.graphics.drawRect(0, 0, groupRadius*2, groupRadius*2);
    rect.graphics.endFill();
    rect.x = position.x - groupRadius;
    rect.y = position.y - groupRadius;
    rect.height = groupRadius*2;
    rect.width = groupRadius*2;
  }

  function redraw(group) {
    var rect = group.groupShape.getChildAt(0);
    var size = 0;
    for (var k in group.players) {
      if (group.players.hasOwnProperty(k)) {
        ++size;
      }
    }
    if (size > 3 && size < 7) {
      rect.graphics.clear();
      drawRectangle(rect, 'green', group.groupPos);
    } else if (size > 6) {
      rect.graphics.clear();
      drawRectangle(rect, 'red', group.groupPos);
    } else {
      rect.graphics.clear();
      drawRectangle(rect, 'grey', group.groupPos);
    }
  }

  // focus on groupname input field in modal
  $('#createGroupModal').on('shown.bs.modal', function(){
    $('#groupName').focus();
  });

});
