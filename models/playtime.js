class Playtime {
    static async add(pool, playerId, totalPlayTime, startTime, testType) {
      const startDate = new Date(startTime * 1000);
      await pool.query(
        'INSERT INTO Playtime (PlayerId, TotalPlaytime, StartTime, TestType) VALUES ($1, $2, $3, $4)',
        [playerId, totalPlayTime, startDate, testType]
      );
    }
  }
  
  module.exports = Playtime;