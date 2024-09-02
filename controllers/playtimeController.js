const { getPool } = require('../config/database');
const Player = require('../models/player');
const Playtime = require('../models/playtime');

exports.addPlaytime = async (req, res) => {
  let { name, totalPlayTime, startTime, testType, gameName } = req.body;
  const pool = getPool(gameName);
  
  try {
    const playerId = await Player.getOrCreate(pool, name, testType, startTime);
    await Playtime.add(pool, playerId, totalPlayTime, startTime, testType);
    res.status(201).send('Playtime record added successfully');
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
};