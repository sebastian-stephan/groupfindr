exports.index = function(req, res){
  res.render('index', { title: 'Home' });
};

exports.chat = function(req, res){
    res.render('canvas', { title: 'Virtual Room' });
};

exports.about = function(req, res){
    res.render('about', { title: 'About' });
};

