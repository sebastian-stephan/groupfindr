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
/**
 *  Adds participant to a group
 */
function addParticipant(groupID, name){
    alert(name);
    $('#g'+groupID).find('ul').append($('<li>', {
        text: name
    }));
}