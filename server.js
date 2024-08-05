const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');  // Import the cors package
const app = express();
const port = 5000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(express.json());
app.use(cors());
app.post('/playtime', async (req, res) => {
  const { name, totalPlayTime, startTime, testType } = req.body;
  console.log("Name", name);
  console.log("totalPlaytime", totalPlayTime);
  console.log("StartTime", startTime);
  console.log("testType", testType);

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
  const { name, startTime, testType, itemPurchase } = req.body;
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
  const { startDate, endDate, testType } = req.body;
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

// Endpoint to get concurrent users per hour
app.post('/concurrent-users-hourly', async (req, res) => {
  const { startDate, endDate, testType  } = req.body;
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

// Endpoint to get total play hours
app.post('/average-play-hours', async (req, res) => {
  const { startDate, endDate,testType  } = req.body;
  console.log(req.body);
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
    const result = await pool.query(query, [startDate, endDate,testType]);
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

// Endpoint to get total play hours per hour
app.post('/average-play-hours-hourly', async (req, res) => {
  const { startDate, endDate,testType  } = req.body;
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
    const result = await pool.query(query, [startDate, endDate,testType ]);
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
  const { startDate, endDate, testType } = req.body;
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


//retention rates 


app.post('/retention-rates', async (req, res) => {
  const { startDate, endDate, retentionType, testType } = req.body;

  let retentionDays;
  switch (retentionType) {
      case 'day1':
          retentionDays = 1;
          break;
      case 'day7':
          retentionDays = 7;
          break;
      case 'day30':
          retentionDays = 30;
          break;
      default:
          return res.status(400).json({ error: 'Invalid retentionType' });
  }

  try {
      const result = await pool.query(
          `
          
      WITH player_first_play AS (
    SELECT p.PlayerId, DATE(p.created_at) AS first_play_date
    FROM Player p
    WHERE DATE(p.created_at) BETWEEN $1::date AND $2::date
),
retention_data AS (
    SELECT 
        pf.first_play_date,
        COUNT(DISTINCT pf.PlayerId) AS initial_players,
        $4::integer AS retention_days,
        COUNT(DISTINCT CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM Playtime pt 
                WHERE pt.PlayerId = pf.PlayerId 
                AND DATE(pt.StartTime) = (pf.first_play_date + ($4::integer * INTERVAL '1 day'))
                AND pt.TestType = $3
            ) THEN pf.PlayerId 
        END) AS retained_players
    FROM player_first_play pf
    WHERE (pf.first_play_date + ($4::integer * INTERVAL '1 day')) <= $2::date
    GROUP BY pf.first_play_date
)
SELECT 
    (first_play_date + INTERVAL '1 day')::date AS first_play_date,
    $3 AS TestType,
    initial_players,
    retained_players,
    retention_days,
    ROUND(CAST(retained_players AS NUMERIC) / NULLIF(initial_players, 0) * 100, 2) AS retention_rate
FROM retention_data
ORDER BY first_play_date;
          
          `,
          [startDate, endDate, testType, retentionDays]
      );

      res.json(result.rows);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while calculating retention rates.' });
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
