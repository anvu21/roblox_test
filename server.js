const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');  // Import the cors package
const app = express();
const port = 5000;
const moment = require('moment-timezone');
const pools = {};  // Create a pools object to store different pool instances

function getPool(gameName) {
  const dbName = gameName ? gameName : process.env.DB_NAME;
  if (!pools[dbName]) {
    pools[dbName] = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: dbName,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });
  }
  return pools[dbName];
}

app.use(express.json());
app.use(cors());

app.post('/playtime', async (req, res) => {
  const { name, totalPlayTime, startTime, testType, gameName } = req.body;
  console.log("Name", name);
  console.log("totalPlaytime", totalPlayTime);
  console.log("StartTime", startTime);
  console.log("testType", testType);
  console.log("gameName", gameName);

  const pool = getPool(gameName);

  try {
    console.log('Request data:', req.body);
    
    // Check if the player exists, if not create one
    let result = await pool.query('SELECT PlayerId, created_at FROM Player WHERE Name = $1', [name]);
    let playerId, createdAt;

    if (result.rows.length === 0) {
      // Player does not exist, create one
      result = await pool.query('INSERT INTO Player (Name, created_at) VALUES ($1, $2) RETURNING PlayerId, created_at', [name, new Date(startTime * 1000)]);
      playerId = result.rows[0].playerid;
      createdAt = result.rows[0].created_at;
    } else {
      // Player exists
      playerId = result.rows[0].playerid;
      createdAt = result.rows[0].created_at;
    }

    // Convert Unix timestamp to JavaScript Date object
    const startDate = new Date(startTime * 1000);

    // Insert playtime record
    await pool.query(
      'INSERT INTO Playtime (PlayerId, TotalPlaytime, StartTime, TestType) VALUES ($1, $2, $3, $4)',
      [playerId, totalPlayTime, startDate, testType]
    );

    res.status(201).send('Playtime record added successfully');
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/playeritem', async (req, res) => {
  const { name, startTime, testType, itemPurchase, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    // Log the incoming request data for debugging
    console.log('Request data:', req.body);

    // Check if the player exists, if not create one
    let result = await pool.query('SELECT PlayerId, created_at FROM Player WHERE Name = $1', [name]);
    let playerId, createdAt;

    if (result.rows.length === 0) {
      // Player does not exist, create one
      const createdAtDate = new Date(startTime * 1000);
      result = await pool.query('INSERT INTO Player (Name, created_at) VALUES ($1, $2) RETURNING PlayerId, created_at', [name, createdAtDate]);
      playerId = result.rows[0].playerid;
      createdAt = result.rows[0].created_at;
    } else {
      // Player exists
      playerId = result.rows[0].playerid;
      createdAt = result.rows[0].created_at;
    }

    // Convert Unix timestamp to JavaScript Date object
    const startDate = new Date(startTime * 1000);

    // Insert player item record
    await pool.query(
      'INSERT INTO PlayerItem (PlayerId, StartTime, TestType, ItemPurchase) VALUES ($1, $2, $3, $4)',
      [playerId, startDate, testType, itemPurchase]
    );

    res.status(201).send('Player item record added successfully');
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/concurrent-users', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    const query = `
      SELECT 
        DATE_TRUNC('day', StartTime) AS play_date,
        TestType,
        COUNT(DISTINCT PlayerId) AS unique_users
      FROM 
        Playtime
      WHERE 
        StartTime BETWEEN $1 AND $2
        AND TestType = ANY($3::text[])
      GROUP BY 
        play_date, TestType
      ORDER BY 
        play_date, TestType;
    `;
    const result = await pool.query(query, [startDate, endDate, testType]);
    const data = result.rows.map(row => ({
      date: row.play_date,
      testType: row.testtype,
      uniqueUsers: parseInt(row.unique_users, 10)
    }));
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/concurrent-users-hourly', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    const query = `
      WITH hourly_intervals AS (
        SELECT generate_series(
          DATE_TRUNC('hour', $1::timestamp),
          DATE_TRUNC('hour', $2::timestamp),
          '1 hour'::interval
        ) AS hour
      )
      SELECT
        hi.hour AS play_hour,
        p.TestType,
        COUNT(DISTINCT p.PlayerId) AS unique_users
      FROM
        hourly_intervals hi
      LEFT JOIN Playtime p ON
        p.StartTime <= hi.hour + INTERVAL '1 hour' AND
        p.StartTime + (p.TotalPlaytime * INTERVAL '1 minute') > hi.hour
      WHERE
        hi.hour BETWEEN $1 AND $2
        AND TestType = ANY($3::text[])
      GROUP BY
        hi.hour, p.TestType
      ORDER BY
        hi.hour, p.TestType;
    `;
    
    const result = await pool.query(query, [startDate, endDate, testType]);
    
    const data = result.rows.map(row => ({
      date: row.play_hour,
      testType: row.testtype,
      uniqueUsers: parseInt(row.unique_users, 10)
    }));
    
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/average-play-hours', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    const query = `
      SELECT
        DATE_TRUNC('day', StartTime) AS play_date,
        TestType,
        AVG(TotalPlaytime) / 3600 AS avg_hours
      FROM
        Playtime
      WHERE
        StartTime BETWEEN $1 AND $2
        AND TestType = ANY($3::text[])
      GROUP BY
        play_date, TestType
      ORDER BY
        play_date, TestType;
    `;
    const result = await pool.query(query, [startDate, endDate, testType]);
    const data = result.rows.map(row => ({
      date: row.play_date,
      testType: row.testtype,
      avgHours: parseFloat(row.avg_hours)
    }));
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/average-play-hours-hourly', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    const query = `
      SELECT
        DATE_TRUNC('hour', StartTime) AS play_hour,
        TestType,
        AVG(TotalPlaytime) / 3600 AS avg_hours
      FROM
        Playtime
      WHERE
        StartTime BETWEEN $1 AND $2
        AND TestType = ANY($3::text[])
      GROUP BY
        play_hour, TestType
      ORDER BY
        play_hour, TestType;
    `;
    const result = await pool.query(query, [startDate, endDate, testType]);
    const data = result.rows.map(row => ({
      date: row.play_hour,
      testType: row.testtype,
      avgHours: parseFloat(row.avg_hours)
    }));
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/total-purchases', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Calculating total purchases from", startDate, "to", endDate, "for test types", testType);

  try {
    const query = `
      SELECT 
        DATE_TRUNC('day', pi.StartTime) AS purchase_date,
        pi.TestType,
        SUM(CAST(pi.ItemPurchase AS INTEGER)) AS total_purchases
      FROM 
        PlayerItem pi
      WHERE 
        pi.StartTime BETWEEN $1 AND $2
        AND pi.TestType = ANY($3::text[])
      GROUP BY 
        DATE_TRUNC('day', pi.StartTime), pi.TestType
      ORDER BY 
        purchase_date, pi.TestType;
    `;

    const result = await pool.query(query, [startDate, endDate, testType]);

    const data = result.rows.map(row => ({
      date: row.purchase_date,
      testType: row.testtype,
      totalPurchases: parseInt(row.total_purchases, 10)
    }));

    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.post('/average-revenue', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Calculating average revenue from", startDate, "to", endDate, "for test types", testType);
  
  try {
    const query = `
      SELECT
        DATE_TRUNC('day', pi.StartTime) AS purchase_date,
        pi.TestType,
        AVG(CAST(pi.ItemPurchase AS FLOAT)) AS avg_revenue
      FROM
        PlayerItem pi
      WHERE
        pi.StartTime BETWEEN $1 AND $2
        AND pi.TestType = ANY($3::text[])
      GROUP BY
        DATE_TRUNC('day', pi.StartTime), pi.TestType
      ORDER BY
        purchase_date, pi.TestType;
    `;
    
    const result = await pool.query(query, [startDate, endDate, testType]);
    
    const data = result.rows.map(row => ({
      date: row.purchase_date,
      testType: row.testtype,
      avgRevenue: parseFloat(row.avg_revenue)
    }));
    
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});
/*
app.post('/custom-query', async (req, res) => {
  const { gameName, query, params } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Executing custom query");
  
  try {
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await pool.query(query, params);
    
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error executing custom query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});*/

app.post('/retention', async (req, res) => {
  try {
    const { startDate, endDate, retentionType, testType, gameName } = req.body;
    console.log("Request parameters:", { startDate, endDate, retentionType, testType, gameName });

    // Validate input
    if (!startDate || !endDate || !retentionType || !testType || !gameName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const pool = getPool(gameName);

    // Updated PostgreSQL query
    const query = `
      WITH DateRange AS (
  SELECT generate_series($1::date, $2::date, '1 day'::interval) AS date
),
FirstPlaytime AS (
  SELECT 
    PlayerId,
    TestType,
    DATE_TRUNC('day', MIN(StartTime)) AS FirstPlayDate
  FROM Playtime
  WHERE StartTime::date BETWEEN $1::date AND $2::date
    AND TestType = ANY($3::text[])
  GROUP BY PlayerId, TestType
),
DailyRetention AS (
  SELECT 
    fp.FirstPlayDate AS JoinDate,
    fp.TestType,
    COUNT(DISTINCT fp.PlayerId) AS NewPlayerCount,
    COUNT(DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM Playtime pt
        WHERE pt.PlayerId = fp.PlayerId 
          AND DATE_TRUNC('day', pt.StartTime) = fp.FirstPlayDate + INTERVAL '1 day'
          AND pt.TestType = fp.TestType
      ) THEN fp.PlayerId 
    END) AS ReturnedPlayerCount
  FROM FirstPlaytime fp
  GROUP BY fp.FirstPlayDate, fp.TestType
)
SELECT 
  dr.date AS JoinDate,
  COALESCE(ret.TestType, $3[1]) AS TestType,
  COALESCE(ret.NewPlayerCount, 0) AS NewPlayerCount,
  COALESCE(ret.ReturnedPlayerCount, 0) AS ReturnedPlayerCount,
  CASE 
    WHEN COALESCE(ret.NewPlayerCount, 0) > 0 THEN 
      ROUND((COALESCE(ret.ReturnedPlayerCount, 0)::numeric / ret.NewPlayerCount) * 100, 2)
    ELSE 0 
  END AS RetentionRate
FROM DateRange dr
LEFT JOIN DailyRetention ret ON ret.JoinDate = dr.date
ORDER BY dr.date, ret.TestType;
    `;

    // Execute query
    const { rows } = await pool.query(query, [startDate, endDate, testType]);

    // Send response
    res.json({
      gameName,
      retentionType,
      data: rows
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});



app.get('/check-raw-data', async (req, res) => {
  const { gameName } = req.query;
  const pool = getPool(gameName);

  try {
    const playerResult = await pool.query('SELECT * FROM Player ORDER BY created_at LIMIT 10');
    const playtimeResult = await pool.query('SELECT * FROM Playtime ORDER BY StartTime LIMIT 10');
    
    res.json({
      players: playerResult.rows,
      playtimes: playtimeResult.rows
    });
  } catch (err) {
    console.error("Error checking raw data:", err);
    res.status(500).json({ error: 'An error occurred while checking raw data.' });
  }
});

app.get('/test-types', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT TestType
      FROM Playtime
      ORDER BY TestType;
    `;
    const result = await pool.query(query);
    const testType = result.rows.map(row => row.testtype);
    res.status(200).json(testType);
  } catch (err) {
    console.error('Error fetching test types:', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
