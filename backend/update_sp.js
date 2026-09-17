const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function updateProcedures() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sportzmitra_auction',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
  });

  const spPlaceBid = `DROP PROCEDURE IF EXISTS sp_place_bid;
CREATE PROCEDURE sp_place_bid(
  IN p_auction_id BIGINT,
  IN p_player_id BIGINT,
  IN p_team_id BIGINT,
  IN p_bid_amount DECIMAL(12,2),
  IN p_user_id BIGINT
)
BEGIN
  DECLARE v_current_player_id BIGINT DEFAULT NULL;
  DECLARE v_base_price DECIMAL(12,2) DEFAULT 0;
  DECLARE v_remaining_purse DECIMAL(12,2) DEFAULT 0;
  DECLARE v_player_status VARCHAR(30) DEFAULT NULL;
  DECLARE v_team_player_count INT DEFAULT 0;
  DECLARE v_team_player_limit INT DEFAULT NULL;
  DECLARE v_auction_player_limit INT DEFAULT 0;

  -- Get current player from state
  SELECT current_player_id INTO v_current_player_id
  FROM auction_state
  WHERE auction_id = p_auction_id;

  IF v_current_player_id IS NULL OR v_current_player_id <> p_player_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Player is not the current active player';
  END IF;

  -- Get player base price and status
  SELECT base_price, status INTO v_base_price, v_player_status
  FROM players
  WHERE id = p_player_id AND auction_id = p_auction_id;

  IF v_player_status NOT IN ('IN_AUCTION', 'AVAILABLE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Player is not available for bidding';
  END IF;

  IF p_bid_amount < COALESCE(v_base_price, 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bid cannot be below base price';
  END IF;

  -- Get team remaining purse and player limit
  SELECT remaining_purse, player_limit INTO v_remaining_purse, v_team_player_limit
  FROM teams
  WHERE id = p_team_id AND auction_id = p_auction_id AND status = 'ACTIVE';

  IF v_remaining_purse IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team not found or inactive';
  END IF;

  IF p_bid_amount > v_remaining_purse THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bid exceeds team remaining purse';
  END IF;

  -- Get team current players count
  SELECT COUNT(id) INTO v_team_player_count
  FROM players
  WHERE sold_team_id = p_team_id AND auction_id = p_auction_id AND status = 'SOLD';

  -- Get auction default player limit
  SELECT players_per_team INTO v_auction_player_limit
  FROM auctions
  WHERE id = p_auction_id;

  IF v_team_player_count >= COALESCE(v_team_player_limit, v_auction_player_limit, 999) AND COALESCE(v_team_player_limit, v_auction_player_limit, 0) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team has reached its maximum player limit';
  END IF;

  -- Update auction state with new bid
  UPDATE auction_state
  SET current_bid = p_bid_amount,
      highest_team_id = p_team_id,
      state = 'BIDDING',
      updated_by_user_id = p_user_id,
      bid_preview_updated_at = NOW(),
      updated_at = NOW()
  WHERE auction_id = p_auction_id;

  -- Log the bid
  INSERT INTO auction_action_logs
    (auction_id, player_id, team_id, action_type, new_data, performed_by_user_id, reason)
  VALUES
    (p_auction_id, p_player_id, p_team_id, 'BID_PLACED',
     JSON_OBJECT('player_id', p_player_id, 'team_id', p_team_id, 'bid_amount', p_bid_amount),
     p_user_id, 'Bid placed');

  -- Return full snapshot
  CALL sp_get_public_auction_snapshot(p_auction_id);
END;`;

  const spMarkSold = `DROP PROCEDURE IF EXISTS sp_mark_player_sold;
CREATE PROCEDURE sp_mark_player_sold(
  IN p_auction_id BIGINT,
  IN p_user_id BIGINT
)
BEGIN
  DECLARE v_player_id BIGINT DEFAULT NULL;
  DECLARE v_team_id BIGINT DEFAULT NULL;
  DECLARE v_bid_amount DECIMAL(12,2) DEFAULT 0;
  DECLARE v_player_name VARCHAR(150) DEFAULT NULL;
  DECLARE v_team_name VARCHAR(150) DEFAULT NULL;
  DECLARE v_unsold_count INT DEFAULT 0;
  DECLARE v_remaining_purse DECIMAL(12,2) DEFAULT 0;
  DECLARE v_team_player_count INT DEFAULT 0;
  DECLARE v_team_player_limit INT DEFAULT NULL;
  DECLARE v_auction_player_limit INT DEFAULT 0;

  -- Get current state
  SELECT current_player_id, highest_team_id, current_bid
  INTO v_player_id, v_team_id, v_bid_amount
  FROM auction_state
  WHERE auction_id = p_auction_id;

  IF v_player_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active player to mark as sold';
  END IF;

  IF v_team_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No team has placed a bid yet';
  END IF;

  -- Get player details
  SELECT player_name, COALESCE(unsold_count, 0) INTO v_player_name, v_unsold_count
  FROM players WHERE id = v_player_id;

  -- Get team details (name, purse, limit)
  SELECT team_name, remaining_purse, player_limit
  INTO v_team_name, v_remaining_purse, v_team_player_limit
  FROM teams WHERE id = v_team_id;

  IF v_bid_amount > v_remaining_purse THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bid exceeds team remaining purse';
  END IF;

  -- Check roster limit
  SELECT COUNT(id) INTO v_team_player_count
  FROM players
  WHERE sold_team_id = v_team_id AND auction_id = p_auction_id AND status = 'SOLD';

  SELECT players_per_team INTO v_auction_player_limit
  FROM auctions
  WHERE id = p_auction_id;

  IF v_team_player_count >= COALESCE(v_team_player_limit, v_auction_player_limit, 999) AND COALESCE(v_team_player_limit, v_auction_player_limit, 0) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team has reached its maximum player limit';
  END IF;

  -- Mark player as SOLD
  UPDATE players
  SET status = 'SOLD',
      sold_team_id = v_team_id,
      sold_price = v_bid_amount,
      sold_amount = v_bid_amount,
      sold_at = NOW()
  WHERE id = v_player_id AND auction_id = p_auction_id;

  -- Deduct from team purse
  UPDATE teams
  SET remaining_purse = GREATEST(0, remaining_purse - v_bid_amount),
      balance_purse = GREATEST(0, COALESCE(balance_purse, remaining_purse) - v_bid_amount)
  WHERE id = v_team_id AND auction_id = p_auction_id;

  -- Update auction state to SOLD
  UPDATE auction_state
  SET state = 'SOLD',
      updated_by_user_id = p_user_id,
      updated_at = NOW()
  WHERE auction_id = p_auction_id;

  -- Log the sale
  INSERT INTO auction_action_logs
    (auction_id, player_id, team_id, action_type, new_data, performed_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, v_team_id, 'PLAYER_SOLD',
     JSON_OBJECT('player_id', v_player_id, 'player_name', v_player_name,
                 'team_id', v_team_id, 'team_name', v_team_name,
                 'sold_amount', v_bid_amount),
     p_user_id, 'Player sold');

  -- Log attempt
  INSERT INTO player_auction_attempts
    (auction_id, player_id, team_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, v_team_id, 'SOLD', COALESCE(v_unsold_count, 0) + 1, 'SOLD',
     v_bid_amount, p_user_id, 'Player sold in auction');

  -- Return full snapshot
  CALL sp_get_public_auction_snapshot(p_auction_id);
END;`;

  try {
    console.log('Updating sp_place_bid...');
    await pool.query(spPlaceBid);
    console.log('Updating sp_mark_player_sold...');
    await pool.query(spMarkSold);
    console.log('Procedures updated successfully.');
  } catch (error) {
    console.error('Error updating procedures:', error);
  } finally {
    await pool.end();
  }
}

updateProcedures();
