const router = module.exports = require('express').Router();

router.use('/courses', require('./courses'));
router.use('/students', require('./students'));
router.use('/users', require('./users'));
router.use('/login', require('./login'));

router.get('/', function(req, res) {
    res.status(404).send("Not a valid route.</br>Refer <a href='https://github.com/liderrick/Course-Student-API#Routes'>here</a> for documentation.");
});