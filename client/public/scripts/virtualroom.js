$(function(){
    var socket = io();
    /**
     *  Adds option to th roomlist
     */
	socket.on('roomUpdate', function(roomNames) {
        roomNames.forEach(function (room) {
            $('#rooms').append($('<option>', {
                value: room
            }));
        });
    });
});