require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const archiver = require('archiver');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL pool configuration using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// API endpoint to log playtime
app.post('/api/playtime', async (req, res) => {
  const { name, totalPlayTime, testType } = req.body;

  try {
    // Check if player exists
    let result = await pool.query('SELECT PlayerId FROM Player WHERE Name = $1', [name]);

    let playerId;
    if (result.rows.length === 0) {
      // Player does not exist, insert new player
      result = await pool.query('INSERT INTO Player (Name) VALUES ($1) RETURNING PlayerId', [name]);
      playerId = result.rows[0].playerid;
    } else {
      // Player exists, get the PlayerId
      playerId = result.rows[0].playerid;
    }

    // Insert playtime record
    result = await pool.query(
      'INSERT INTO Playtime (PlayerId, Total_playTime, A_or_B) VALUES ($1, $2, $3) RETURNING *',
      [playerId, totalPlayTime, testType]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error logging playtime:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to log item purchase
app.post('/api/item', async (req, res) => {
  const { name, testType, purchased } = req.body;

  try {
    // Check if player exists
    let result = await pool.query('SELECT PlayerId FROM Player WHERE Name = $1', [name]);

    let playerId;
    if (result.rows.length === 0) {
      // Player does not exist, insert new player
      result = await pool.query('INSERT INTO Player (Name) VALUES ($1) RETURNING PlayerId', [name]);
      playerId = result.rows[0].playerid;
    } else {
      // Player exists, get the PlayerId
      playerId = result.rows[0].playerid;
    }

    // Insert item purchase record
    result = await pool.query(
      'INSERT INTO PlayerItem (PlayerId, A_or_B, Item_purchase) VALUES ($1, $2, $3) RETURNING *',
      [playerId, testType, purchased]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error logging item purchase:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to fetch total playtime for each test type
app.get('/api/playtime', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT A_or_B, SUM(Total_playTime) as total_playtime FROM Playtime GROUP BY A_or_B'
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching total playtime:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to fetch item purchases for each test type
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT A_or_B, Item_purchase, COUNT(*) as purchase_count FROM PlayerItem GROUP BY A_or_B, Item_purchase'
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching item purchases:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Helper function to generate CSV
const generateCsv = async (csvPath, csvHeaders, query) => {
  const result = await pool.query(query);
  const data = result.rows;

  const csvWriter = createCsvWriter({
    path: csvPath,
    header: csvHeaders
  });

  await csvWriter.writeRecords(data);
};

// API endpoint to download all tables as a ZIP
app.get('/api/download/all', async (req, res) => {
  try {
    // Generate CSV files for each table
    await generateCsv('Player.csv', [
      { id: 'playerid', title: 'PlayerId' },
      { id: 'name', title: 'Name' }
    ], 'SELECT * FROM Player');

    await generateCsv('Playtime.csv', [
      { id: 'playtimeid', title: 'PlaytimeId' },
      { id: 'playerid', title: 'PlayerId' },
      { id: 'total_playtime', title: 'Total_playTime' },
      { id: 'a_or_b', title: 'A_or_B' }
    ], 'SELECT * FROM Playtime');

    await generateCsv('PlayerItem.csv', [
      { id: 'playeritemid', title: 'PlayerItemId' },
      { id: 'playerid', title: 'PlayerId' },
      { id: 'a_or_b', title: 'A_or_B' },
      { id: 'item_purchase', title: 'Item_purchase' }
    ], 'SELECT * FROM PlayerItem');

    // Create a ZIP file containing the CSV files
    const zipPath = 'data.zip';
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => {
      res.download(zipPath, 'data.zip', (err) => {
        if (err) {
          console.error('Error downloading ZIP file:', err);
          res.status(500).send('Internal Server Error');
        } else {
          // Delete the temporary files after sending the response
          fs.unlinkSync('Player.csv');
          fs.unlinkSync('Playtime.csv');
          fs.unlinkSync('PlayerItem.csv');
          fs.unlinkSync(zipPath);
        }
      });
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.file('Player.csv', { name: 'Player.csv' });
    archive.file('Playtime.csv', { name: 'Playtime.csv' });
    archive.file('PlayerItem.csv', { name: 'PlayerItem.csv' });
    archive.finalize();

  } catch (error) {
    console.error('Error generating ZIP:', error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
