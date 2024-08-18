const express = require('express');
const router = express.Router();
const { addPlaytime } = require('../controllers/playtimeController');

router.post('/', addPlaytime);

module.exports = router;