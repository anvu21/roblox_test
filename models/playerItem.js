class PlayerItem {
    static async add(pool, playerId, startTime, testType, itemPurchase) {
      const startDate = new Date(startTime * 1000);
      await pool.query(
        'INSERT INTO PlayerItem (PlayerId, StartTime, TestType, ItemPurchase) VALUES ($1, $2, $3, $4)',
        [playerId, startDate, testType, itemPurchase]
      );
    }
  }
  
  module.exports = PlayerItem;