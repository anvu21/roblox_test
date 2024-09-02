const { getPool } = require('../config/database');
const { getAllTestTypes } = require('../utils/queryHelpers');

exports.getConcurrentUsers = async (req, res) => {
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
};

exports.getConcurrentUsersHourly = async (req, res) => {
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
};

exports.getAveragePlayHours = async (req, res) => {
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
};

exports.getAveragePlayHoursHourly = async (req, res) => {
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
    }};

exports.getTotalPurchases = async (req, res) => {
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
    }};

exports.getAverageRevenue = async (req, res) => {
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
    }};

exports.getAverageRevenuePerPlayer = async (req, res) => {
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
    }};

exports.getTestTypes = async (req, res) => {
  const { gameName } = req.body;
  const pool = getPool(gameName);

  try {
    const testTypes = await getAllTestTypes(pool);
    res.status(200).json(testTypes);
  } catch (err) {
    console.error('Error fetching test types:', err.message, err.stack);
    res.status(500).send('Server error');
  }
};