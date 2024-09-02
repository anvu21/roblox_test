const { getPool } = require('../config/database');
const Player = require('../models/player');
const PlayerItem = require('../models/playerItem');

exports.addPlayerItem = async (req, res) => {
  let { name, startTime, testType, itemPurchase, gameName } = req.body;
  const pool = getPool(gameName);
  
  try {
    const playerId = await Player.getOrCreate(pool, name, testType, startTime);
    await PlayerItem.add(pool, playerId, startTime, testType, itemPurchase);
    res.status(201).send('Player item record added successfully');
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
};