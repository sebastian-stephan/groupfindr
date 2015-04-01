exports.index = function(req, res){
  res.render('index', { title: 'Home' });
};

exports.chat = function(req, res){
    res.render('sockettest', { title: 'Sockettest' });
};

exports.about = function(req, res){
    res.render('about', { title: 'About' });
};

