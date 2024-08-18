const express = require('express');
const router = express.Router();
const { addPlayerItem } = require('../controllers/playerItemController');

router.post('/', addPlayerItem);

module.exports = router;