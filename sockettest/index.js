var app = exports = module.exports = {};

app.init = function(server) {
    var that = this;
    app.io = require('socket.io')(server);

    app.io.on('connect', function(socket) {

        /* When a user logs in */
        socket.on('login', function(data) {
            socket.join(data.room);
            socket.username = data.username;
            socket.x = data.x;
            socket.y = data.y;

            // Send this new player's position to everyone
            var newPos = {id: socket.id, username:socket.username, x:socket.x, y:socket.y };
            app.io.to(data.room).emit('update', newPos);

            // Send back information about all other players
            var room = app.io.nsps['/'].adapter.rooms[data.room];
            for (var socketId in room) {
                var usr = that.io.sockets.connected[socketId];
                var pos = {id: usr.id, username:usr.username, x:usr.x, y:usr.y };
                socket.emit('update', pos);
            }

        });

        /* When a user logs out */
        socket.on('disconnect', function() {
            app.io.sockets.emit('remove', socket.id);
        });

        /* When a user sends a position update */
        socket.on('updatepos', function(pos) {
            socket.x = pos.x;
            socket.y = pos.y;

            var newPos = {id: socket.id, username:socket.username, x:socket.x, y:socket.y };

            // Broadcast new position to all rooms except own 'private' room
            // socket.io by default joins a room with the name of the socket id
            // We don't need that -> Performance gain.

            // Also think about disallowing multiple rooms for one socket. Doesn't really make
            // sense since he/she would move around the same path in multiple rooms.
            for (index = 0, len = socket.rooms.length; index < len; ++index) {
                var room = socket.rooms[index];
                if (!(room === socket.id)) {
                    app.io.to(room).emit('update', newPos);
                }
            }


        });

    });
}

