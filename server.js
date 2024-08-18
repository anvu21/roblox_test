


const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');  // Import the cors package
const app = express();
const port = 5000;
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


async function getTestTypes(pool) {
  const result = await pool.query('SELECT DISTINCT TestType FROM Playtime ORDER BY TestType');
  return result.rows.map(row => row.testtype);
}

async function ensureTestTypes(pool, testType) {
  if (!testType || testType.length === 0) {
    testType = await getTestTypes(pool);
  }
  return testType;
}
app.post('/playtime', async (req, res) => {
  let { name, totalPlayTime, startTime, testType, gameName } = req.body;
  console.log("Name", name);
  console.log("totalPlaytime", totalPlayTime);
  console.log("StartTime", startTime);
  console.log("testType", testType);
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    console.log('Request data:', req.body);
   
    // Check if the player exists using both name and testType
    let result = await pool.query('SELECT PlayerId, created_at FROM Player WHERE Name = $1 AND TestType = $2', [name, testType]);
    let playerId, createdAt;
    if (result.rows.length === 0) {
      // Player does not exist, create one
      result = await pool.query('INSERT INTO Player (Name, created_at, TestType) VALUES ($1, $2, $3) RETURNING PlayerId, created_at', [name, new Date(startTime * 1000), testType]);
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
  let { name, startTime, testType, itemPurchase, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    // Log the incoming request data for debugging
    console.log('Request data:', req.body);
    // Check if the player exists using both name and testType
    let result = await pool.query('SELECT PlayerId, created_at FROM Player WHERE Name = $1 AND TestType = $2', [name, testType]);
    let playerId, createdAt;
    if (result.rows.length === 0) {
      // Player does not exist, create one
      const createdAtDate = new Date(startTime * 1000);
      result = await pool.query('INSERT INTO Player (Name, created_at, TestType) VALUES ($1, $2, $3) RETURNING PlayerId, created_at', [name, createdAtDate, testType]);
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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);
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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {
    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  try {

    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Calculating total purchases from", startDate, "to", endDate, "for test types", testType);

  try {
    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

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
  let { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Calculating average revenue from", startDate, "to", endDate, "for test types", testType);
  
  try {
    testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

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

app.get('/retention', async (req, res) => {
  let { startDate, endDate, retentionType, testType, gameName } = req.body;
  const pool = getPool(gameName);


  testType = testType ? (Array.isArray(testType) ? testType : [testType]) : await getAllTestTypes(pool);

  if (!startDate || !endDate || !retentionType || !testType) {
    return res.status(400).json({ error: "Start date, end date, retention type, and test type are required" });
  }

  const testTypesArray = Array.isArray(testType) ? testType : [testType];

  try {

    const query = `
      WITH date_range AS (
        SELECT generate_series($1::date, $2::date, '1 day'::interval) AS date
      ),
      new_players AS (
        SELECT 
          DATE(created_at) + INTERVAL '1 day' AS retention_date,
          testtype,
          COUNT(DISTINCT playerid) AS new_count,
          ARRAY_AGG(DISTINCT playerid) AS new_player_ids
        FROM player
        WHERE DATE(created_at) BETWEEN $1::date - INTERVAL '1 day' AND $2::date - INTERVAL '1 day'
          AND testtype = ANY($3)
        GROUP BY DATE(created_at), testtype
      ),
      returning_players AS (
        SELECT 
          DATE(pt.starttime) AS return_date,
          p.testtype,
          COUNT(DISTINCT p.playerid) AS return_count
        FROM player p
        JOIN playtime pt ON p.playerid = pt.playerid
        JOIN new_players np ON DATE(pt.starttime) = np.retention_date AND p.testtype = np.testtype
        WHERE DATE(pt.starttime) BETWEEN $1::date AND $2::date
          AND p.testtype = ANY($3)
          AND pt.testtype = p.testtype
          AND p.playerid = ANY(np.new_player_ids)
        GROUP BY DATE(pt.starttime), p.testtype
      )
      SELECT 
        dr.date,
        tt.testtype,
        COALESCE(np.new_count, 0) AS new_players,
        COALESCE(rp.return_count, 0) AS returning_players,
        CASE 
          WHEN COALESCE(np.new_count, 0) > 0 
          THEN CAST((COALESCE(rp.return_count, 0)::float / np.new_count) * 100 AS DECIMAL(5,2))
          ELSE 0 
        END AS retention_rate
      FROM date_range dr
      CROSS JOIN unnest($3::text[]) AS tt(testtype)
      LEFT JOIN new_players np ON dr.date = np.retention_date AND np.testtype = tt.testtype
      LEFT JOIN returning_players rp ON dr.date = rp.return_date AND rp.testtype = tt.testtype
      ORDER BY dr.date, tt.testtype
    `;

    const result = await pool.query(query, [startDate, endDate, testTypesArray]);

    const formattedResults = result.rows.reduce((acc, row) => {
      const testType = row.testtype;
      if (!acc[testType]) {
        acc[testType] = [];
      }
      acc[testType].push({
        date: row.date.toISOString().split('T')[0],
        new_players: parseInt(row.new_players),
        returning_players: parseInt(row.returning_players),
        retention_rate: parseFloat(row.retention_rate)
      });
      return acc;
    }, {});

    res.json(formattedResults);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



app.get('/7-day-retention', async (req, res) => {
  const { startDate, endDate, testType,gameName } = req.body;
  const pool = getPool(gameName);

  if (!startDate || !endDate || !testType) {
    return res.status(400).json({ error: "Start date, end date, and test type are required" });
  }

  const testTypesArray = Array.isArray(testType) ? testType : [testType];

  try {
    const query = `
      WITH date_range AS (
        SELECT generate_series($1::date, $2::date, '1 day'::interval) AS date
      ),
      new_players AS (
        SELECT 
          DATE(created_at) + INTERVAL '7 days' AS retention_date,
          testtype,
          COUNT(DISTINCT playerid) AS new_count,
          ARRAY_AGG(DISTINCT playerid) AS new_player_ids
        FROM player
        WHERE DATE(created_at) BETWEEN $1::date - INTERVAL '7 days' AND $2::date - INTERVAL '7 days'
          AND testtype = ANY($3)
        GROUP BY DATE(created_at), testtype
      ),
      returning_players AS (
        SELECT 
          DATE(pt.starttime) AS return_date,
          p.testtype,
          COUNT(DISTINCT p.playerid) AS return_count
        FROM player p
        JOIN playtime pt ON p.playerid = pt.playerid
        JOIN new_players np ON DATE(pt.starttime) = np.retention_date AND p.testtype = np.testtype
        WHERE DATE(pt.starttime) BETWEEN $1::date AND $2::date
          AND p.testtype = ANY($3)
          AND pt.testtype = p.testtype
          AND p.playerid = ANY(np.new_player_ids)
        GROUP BY DATE(pt.starttime), p.testtype
      )
      SELECT 
        dr.date,
        tt.testtype,
        COALESCE(np.new_count, 0) AS new_players,
        COALESCE(rp.return_count, 0) AS returning_players,
        CASE 
          WHEN COALESCE(np.new_count, 0) > 0 
          THEN CAST((COALESCE(rp.return_count, 0)::float / np.new_count) * 100 AS DECIMAL(5,2))
          ELSE 0 
        END AS retention_rate
      FROM date_range dr
      CROSS JOIN unnest($3::text[]) AS tt(testtype)
      LEFT JOIN new_players np ON dr.date = np.retention_date AND np.testtype = tt.testtype
      LEFT JOIN returning_players rp ON dr.date = rp.return_date AND rp.testtype = tt.testtype
      ORDER BY dr.date, tt.testtype
    `;

    const result = await pool.query(query, [startDate, endDate, testTypesArray]);

    const formattedResults = result.rows.reduce((acc, row) => {
      const testType = row.testtype;
      if (!acc[testType]) {
        acc[testType] = [];
      }
      acc[testType].push({
        date: row.date.toISOString().split('T')[0],
        new_players: parseInt(row.new_players),
        returning_players: parseInt(row.returning_players),
        retention_rate: parseFloat(row.retention_rate)
      });
      return acc;
    }, {});

    res.json(formattedResults);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/31-day-retention', async (req, res) => {
  const { startDate, endDate, testType } = req.body;

  if (!startDate || !endDate || !testType) {
    return res.status(400).json({ error: "Start date, end date, and test type are required" });
  }

  const testTypesArray = Array.isArray(testType) ? testType : [testType];

  try {
    const query = `
      WITH date_range AS (
        SELECT generate_series($1::date, $2::date, '1 day'::interval) AS date
      ),
      new_players AS (
        SELECT 
          DATE(created_at) + INTERVAL '31 days' AS retention_date,
          testtype,
          COUNT(DISTINCT playerid) AS new_count,
          ARRAY_AGG(DISTINCT playerid) AS new_player_ids
        FROM player
        WHERE DATE(created_at) BETWEEN $1::date - INTERVAL '31 days' AND $2::date - INTERVAL '31 days'
          AND testtype = ANY($3)
        GROUP BY DATE(created_at), testtype
      ),
      returning_players AS (
        SELECT 
          DATE(pt.starttime) AS return_date,
          p.testtype,
          COUNT(DISTINCT p.playerid) AS return_count
        FROM player p
        JOIN playtime pt ON p.playerid = pt.playerid
        JOIN new_players np ON DATE(pt.starttime) = np.retention_date AND p.testtype = np.testtype
        WHERE DATE(pt.starttime) BETWEEN $1::date AND $2::date
          AND p.testtype = ANY($3)
          AND pt.testtype = p.testtype
          AND p.playerid = ANY(np.new_player_ids)
        GROUP BY DATE(pt.starttime), p.testtype
      )
      SELECT 
        dr.date,
        tt.testtype,
        COALESCE(np.new_count, 0) AS new_players,
        COALESCE(rp.return_count, 0) AS returning_players,
        CASE 
          WHEN COALESCE(np.new_count, 0) > 0 
          THEN CAST((COALESCE(rp.return_count, 0)::float / np.new_count) * 100 AS DECIMAL(5,2))
          ELSE 0 
        END AS retention_rate
      FROM date_range dr
      CROSS JOIN unnest($3::text[]) AS tt(testtype)
      LEFT JOIN new_players np ON dr.date = np.retention_date AND np.testtype = tt.testtype
      LEFT JOIN returning_players rp ON dr.date = rp.return_date AND rp.testtype = tt.testtype
      ORDER BY dr.date, tt.testtype
    `;

    const result = await pool.query(query, [startDate, endDate, testTypesArray]);

    const formattedResults = result.rows.reduce((acc, row) => {
      const testType = row.testtype;
      if (!acc[testType]) {
        acc[testType] = [];
      }
      acc[testType].push({
        date: row.date.toISOString().split('T')[0],
        new_players: parseInt(row.new_players),
        returning_players: parseInt(row.returning_players),
        retention_rate: parseFloat(row.retention_rate)
      });
      return acc;
    }, {});

    res.json(formattedResults);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Internal server error' });
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


app.post('/average-revenue-per-player', async (req, res) => {
  const { startDate, endDate, testType, gameName } = req.body;
  console.log("gameName", gameName);
  const pool = getPool(gameName);
  console.log("Calculating average revenue per player from", startDate, "to", endDate, "for test types", testType);
 
  try {
    const query = `
      WITH PlayerDays AS (
        SELECT 
          p.PlayerId,
          generate_series(
            GREATEST($1::date, p.created_at::date),
            $2::date,
            '1 day'::interval
          )::date AS day
        FROM Player p
        WHERE p.created_at <= $2::date
      ),
      DailyRevenue AS (
        SELECT
          pd.day,
          pi.TestType,
          pd.PlayerId,
          COALESCE(SUM(CAST(pi.ItemPurchase AS FLOAT)), 0) AS daily_revenue
        FROM PlayerDays pd
        LEFT JOIN PlayerItem pi ON pd.PlayerId = pi.PlayerId
          AND pd.day = DATE_TRUNC('day', pi.StartTime)
          AND pi.TestType = ANY($3::text[])
        GROUP BY pd.day, pi.TestType, pd.PlayerId
      )
      SELECT
        day AS purchase_date,
        COALESCE(TestType, 'No Purchase') AS TestType,
        AVG(daily_revenue) AS avg_revenue_per_player
      FROM DailyRevenue
      GROUP BY day, TestType
      ORDER BY day, TestType;
    `;
   
    const result = await pool.query(query, [startDate, endDate, testType]);
   
    const data = result.rows.map(row => ({
      date: row.purchase_date,
      testType: row.testtype,
      avgRevenuePerPlayer: parseFloat(row.avg_revenue_per_player)
    }));
   
    res.status(200).json(data);
  } catch (err) {
    console.error('Error executing query', err.message, err.stack);
    res.status(500).send('Server error');
  }
});
app.get('/test-types', async (req, res) => {
  const {gameName } = req.body;

  const pool = getPool(gameName);

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

async function getAllTestTypes(pool) {
  const query = `
    SELECT DISTINCT TestType 
    FROM Player 
    WHERE TestType IS NOT NULL
  `;
  const result = await pool.query(query);
  return result.rows.map(row => row.TestType);
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
