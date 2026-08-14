const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/safeTradeSpotController');

router.patch('/:id/respond', auth, ctrl.respond);
router.get('/:id', auth, ctrl.getOne);
router.post('/:id/cancel', auth, ctrl.cancel);
router.post('/:id/share-location', auth, ctrl.shareLocation);

module.exports = router;
