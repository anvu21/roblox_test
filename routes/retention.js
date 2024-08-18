const express = require('express');
const router = express.Router();
const { getRetention, get7DayRetention, get31DayRetention } = require('../controllers/retentionController');

router.get('/', getRetention);
router.get('/7-day', get7DayRetention);
router.get('/31-day', get31DayRetention);