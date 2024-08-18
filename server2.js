const express = require('express');
const cors = require('cors');
require('dotenv').config();

const playtimeRoutes = require('./routes/playtime');
const playerItemRoutes = require('./routes/playerItem');
const analyticsRoutes = require('./routes/analytics');
const retentionRoutes = require('./routes/retention');

const app = express();
const port = 5000;

app.use(express.json());
app.use(cors());

app.use('/playtime', playtimeRoutes);
app.use('/playeritem', playerItemRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/retention', retentionRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});