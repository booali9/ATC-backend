const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const geoController = require('../controllers/geoController');

router.get('/search', auth, geoController.search);
router.get('/reverse', auth, geoController.reverse);

module.exports = router;
