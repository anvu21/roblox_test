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
  const { startDate, endDate, testTypes } = req.body;
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
    const result = await pool.query(query, [startDate, endDate, testTypes]);
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
  const { startDate, endDate, testTypes  } = req.body;
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
    
    const result = await pool.query(query, [startDate, endDate, testTypes]);
    
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
  const { startDate, endDate,testTypes  } = req.body;
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
    const result = await pool.query(query, [startDate, endDate,testTypes]);
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
  const { startDate, endDate,testTypes  } = req.body;
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
    const result = await pool.query(query, [startDate, endDate,testTypes ]);
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
  const { startDate, endDate, testTypes } = req.body;
  console.log("Calculating total purchases from", startDate, "to", endDate, "for test types", testTypes);

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

    const result = await pool.query(query, [startDate, endDate, testTypes]);

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
  const { startDate, endDate, testTypes, retentionDays } = req.body;

  try {
    const query = `
      WITH date_range AS (
  SELECT generate_series(DATE($1), DATE($2), '1 day'::interval) AS cohort_date
),
new_users AS (
  SELECT
    p.PlayerId,
    DATE(p.created_at) AS FirstPlayDate,
    pt.TestType
  FROM
    Player p
    JOIN Playtime pt ON p.PlayerId = pt.PlayerId
  WHERE
    DATE(p.created_at) BETWEEN DATE($1) AND DATE($2)
    AND pt.TestType = ANY($3::text[])
  GROUP BY p.PlayerId, DATE(p.created_at), pt.TestType
),
retained_users AS (
  SELECT
    nu.PlayerId,
    nu.FirstPlayDate,
    nu.TestType
  FROM
    new_users nu
    JOIN Playtime pt ON nu.PlayerId = pt.PlayerId
  WHERE
    DATE(pt.StartTime) = nu.FirstPlayDate + interval '1 day' * $4
    AND pt.TestType = nu.TestType
  GROUP BY nu.PlayerId, nu.FirstPlayDate, nu.TestType
),
retention_data AS (
  SELECT
    dr.cohort_date,
    COALESCE(nu.TestType, $3[1]) AS TestType,
    COUNT(DISTINCT nu.PlayerId) AS NewUsers,
    COUNT(DISTINCT ru.PlayerId) AS RetainedUsers
  FROM
    date_range dr
    LEFT JOIN new_users nu ON dr.cohort_date = nu.FirstPlayDate
    LEFT JOIN retained_users ru ON nu.PlayerId = ru.PlayerId AND nu.TestType = ru.TestType
  GROUP BY
    dr.cohort_date, nu.TestType
)
SELECT
  cohort_date AS CohortDate,
  TestType,
  NewUsers,
  RetainedUsers,
  CASE
    WHEN NewUsers > 0 THEN ROUND(CAST((RetainedUsers::float / NewUsers) * 100 AS NUMERIC), 2)
    ELSE 0
  END AS RetentionRate
FROM
  retention_data
ORDER BY
  TestType, CohortDate;
    `;

    const result = await pool.query(query, [startDate, endDate, testTypes, retentionDays]);

    const data = result.rows.map(row => ({
      date: row.cohortdate,
      testType: row.testtype,
      newUsers: parseInt(row.newusers, 10),
      retainedUsers: parseInt(row.retainedusers, 10),
      retentionRate: parseFloat(row.retentionrate)
    }));

    console.log('Retention data:', data); // Add this line for debugging

    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
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
    const testTypes = result.rows.map(row => row.testtype);
    res.status(200).json(testTypes);
  } catch (err) {
    console.error('Error fetching test types:', err.message, err.stack);
    res.status(500).send('Server error');
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
