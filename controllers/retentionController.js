const { getPool } = require('../config/database');
const { getAllTestTypes } = require('../utils/queryHelpers');

exports.getRetention = async (req, res) => {
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
    }};

exports.get7DayRetention = async (req, res) => {
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
    }};

exports.get31DayRetention = async (req, res) => {
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
    }};