class Player {
    static async getOrCreate(pool, name, testType, startTime) {
      let result = await pool.query('SELECT PlayerId, created_at FROM Player WHERE Name = $1 AND TestType = $2', [name, testType]);
      
      if (result.rows.length === 0) {
        result = await pool.query('INSERT INTO Player (Name, created_at, TestType) VALUES ($1, $2, $3) RETURNING PlayerId', [name, new Date(startTime * 1000), testType]);
      }
      
      return result.rows[0].playerid;
    }
  }
  
  module.exports = Player;