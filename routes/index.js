exports.index = function(req, res){
  res.render('virtualroom', { title: 'Virtual Room' });
};

exports.chat = function(req, res){
    res.render('virtualroom', { title: 'Virtual Room' });
};

exports.about = function(req, res){
    res.render('about', { title: 'About' });
};

