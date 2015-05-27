/**
 * groupfindr
 */
var express = require('express')
  , path = require('path')
  , logger = require('morgan')
  , http = require('http')
  , socketserver = require('./server');

// Config express.js
var app = express();
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/client/views');
app.set('view engine', 'jade');
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '/client/public')));
if (app.get('env') == 'development') {
	app.locals.pretty = true;
}

// Main routes
app.get('/', function(req, res){
  res.render('virtualroom', { title: 'groupfindr' });
});

var server = http.createServer(app);
socketserver.init(server);

// Start server
server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
