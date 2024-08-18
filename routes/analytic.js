const express = require('express');
const router = express.Router();
const {
  getConcurrentUsers,
  getConcurrentUsersHourly,
  getAveragePlayHours,
  getAveragePlayHoursHourly,
  getTotalPurchases,
  getAverageRevenue,
  getAverageRevenuePerPlayer,
  getTestTypes
} = require('../controllers/analyticsController');

router.post('/concurrent-users', getConcurrentUsers);
router.post('/concurrent-users-hourly', getConcurrentUsersHourly);
router.post('/average-play-hours', getAveragePlayHours);
router.post('/average-play-hours-hourly', getAveragePlayHoursHourly);
router.post('/total-purchases', getTotalPurchases);
router.post('/average-revenue', getAverageRevenue);
router.post('/average-revenue-per-player', getAverageRevenuePerPlayer);
router.get('/test-types', getTestTypes);


module.exports = router;