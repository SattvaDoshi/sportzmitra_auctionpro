const pool = require("./src/config/db");
const { calculateMaxBids } = require("./src/utils/maxBid");

async function run() {
  try {
    const auctionId = 2; // Demo auction

    const [[stateRow]] = await pool.query(
      `SELECT s.current_player_id, p.base_price, p.category, p.status
       FROM auction_state s
       LEFT JOIN players p ON p.id = s.current_player_id
       WHERE s.auction_id = ?`,
      [auctionId]
    );

    console.log("State Row:", stateRow);

    const currentPlayer = stateRow?.current_player_id && ['IN_AUCTION', 'AVAILABLE'].includes(stateRow.status)
      ? { base_price: stateRow.base_price, category: stateRow.category }
      : null;

    console.log("Current Player passed to maxBids:", currentPlayer);

    const maxBids = await calculateMaxBids(pool, auctionId, currentPlayer);
    console.log("Max Bids Output:", maxBids);

    // Let's also check the sold.byCategory
    const [soldRows] = await pool.query(
      `SELECT sold_team_id AS team_id, category, COUNT(*) AS cnt
       FROM players
       WHERE auction_id = ? AND status = 'SOLD' AND sold_team_id IS NOT NULL
       GROUP BY sold_team_id, category`,
      [auctionId]
    );
    console.log("Sold Rows:", soldRows);

    const [cats] = await pool.query(
      `SELECT category_name, base_price, max_players_per_team
       FROM auction_categories
       WHERE auction_id = ? AND status = 'ACTIVE'
       ORDER BY display_order ASC`,
      [auctionId]
    );
    console.log("Categories:", cats);

    const [teams] = await pool.query(
      `SELECT id, team_name, remaining_purse FROM teams WHERE auction_id = ? AND COALESCE(is_deleted, 0) = 0`,
      [auctionId]
    );
    console.log("Teams:", teams);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
