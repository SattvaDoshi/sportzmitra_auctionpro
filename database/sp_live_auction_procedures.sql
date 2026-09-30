-- ============================================================
-- SportzMitra AuctionPro - Missing Stored Procedures
-- Run this file to create all procedures needed for live auction
-- ============================================================

-- Step 1: Fix ENUMs to support all required states
-- ============================================================

-- Expand auction_state.state enum to include BIDDING, FINAL_UNSOLD
ALTER TABLE auction_state
  MODIFY COLUMN state ENUM(
    'NOT_STARTED', 'PLAYER_ACTIVE', 'BIDDING', 'SOLD', 'UNSOLD',
    'FINAL_UNSOLD', 'PAUSED', 'COMPLETED'
  ) DEFAULT 'NOT_STARTED';

-- Expand players.status enum to include FINAL_UNSOLD
ALTER TABLE players
  MODIFY COLUMN status ENUM(
    'AVAILABLE', 'IN_AUCTION', 'SOLD', 'UNSOLD', 'FINAL_UNSOLD', 'WITHDRAWN'
  ) DEFAULT 'AVAILABLE';

-- Expand auction_action_logs.action_type enum with all required values
ALTER TABLE auction_action_logs
  MODIFY COLUMN action_type ENUM(
    'AUCTION_CREATED', 'AUCTION_RESTORED', 'AUCTION_INACTIVATED',
    'PLAYER_SELECTED', 'BID_PLACED', 'PLAYER_SOLD', 'PLAYER_UNSOLD',
    'PLAYER_FINAL_UNSOLD', 'UNDO', 'AUCTION_PAUSED', 'AUCTION_COMPLETED'
  ) NOT NULL;

-- ============================================================
-- Step 2: Create all missing Stored Procedures
-- ============================================================

DELIMITER $$

-- ------------------------------------------------------------
-- sp_select_current_player(p_auction_id, p_player_id, p_user_id)
-- Sets a player as the current active player in an auction.
-- Returns the full public snapshot so the caller can broadcast it.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS `sp_select_current_player`$$
CREATE PROCEDURE `sp_select_current_player`(
  IN p_auction_id BIGINT,
  IN p_player_id  BIGINT,
  IN p_user_id    BIGINT
)
BEGIN
  DECLARE v_player_name    VARCHAR(150);
  DECLARE v_prev_player_id BIGINT DEFAULT NULL;

  -- Validate player belongs to this auction and is selectable
  SELECT player_name INTO v_player_name
  FROM players
  WHERE id = p_player_id AND auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0
  LIMIT 1;

  IF v_player_name IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Player not found in this auction';
  END IF;

  -- Find the currently IN_AUCTION player (if any) so we can reset them
  SELECT current_player_id INTO v_prev_player_id
  FROM auction_state
  WHERE auction_id = p_auction_id
  LIMIT 1;

  -- If there was a different player already in auction, reset them back to AVAILABLE
  IF v_prev_player_id IS NOT NULL AND v_prev_player_id <> p_player_id THEN
    UPDATE players
    SET status = 'AVAILABLE'
    WHERE id = v_prev_player_id
      AND auction_id = p_auction_id
      AND status = 'IN_AUCTION';
  END IF;

  -- Set the new player status to IN_AUCTION
  UPDATE players
  SET status = 'IN_AUCTION'
  WHERE id = p_player_id AND auction_id = p_auction_id;

  -- Update auction state: set current player, reset bid, clear highest team
  UPDATE auction_state
  SET current_player_id    = p_player_id,
      current_bid          = (SELECT COALESCE(base_price, 0) FROM players WHERE id = p_player_id),
      highest_team_id      = NULL,
      state                = 'PLAYER_ACTIVE',
      suggested_player_id  = NULL,
      updated_by_user_id   = p_user_id,
      updated_at           = NOW()
  WHERE auction_id = p_auction_id;

  -- Log the action
  INSERT INTO auction_action_logs
    (auction_id, player_id, action_type, new_data, performed_by_user_id, reason)
  VALUES
    (p_auction_id, p_player_id, 'PLAYER_SELECTED',
     JSON_OBJECT('player_id', p_player_id, 'player_name', v_player_name),
     p_user_id, 'Player selected for auction');

  -- Return full snapshot
  CALL sp_get_public_auction_snapshot(p_auction_id);
END$$


-- ------------------------------------------------------------
-- sp_place_bid(p_auction_id, p_player_id, p_team_id, p_bid_amount, p_user_id)
-- Records a bid for the current player. Updates auction state.
-- Returns the full public snapshot.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS `sp_place_bid`$$
CREATE PROCEDURE `sp_place_bid`(
  IN p_auction_id  BIGINT,
  IN p_player_id   BIGINT,
  IN p_team_id     BIGINT,
  IN p_bid_amount  DECIMAL(12,2),
  IN p_user_id     BIGINT
)
BEGIN
  DECLARE v_current_player_id BIGINT DEFAULT NULL;
  DECLARE v_base_price        DECIMAL(12,2) DEFAULT 0;
  DECLARE v_remaining_purse   DECIMAL(12,2) DEFAULT 0;
  DECLARE v_player_status     VARCHAR(30) DEFAULT NULL;
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
  SET current_bid            = p_bid_amount,
      highest_team_id        = p_team_id,
      state                  = 'BIDDING',
      updated_by_user_id     = p_user_id,
      bid_preview_updated_at = NOW(),
      updated_at             = NOW()
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
END$$


-- ------------------------------------------------------------
-- sp_mark_player_sold(p_auction_id, p_user_id)
-- Marks the current player as SOLD to the highest bidding team.
-- Deducts sold_amount from team's remaining_purse.
-- Returns the full public snapshot.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS `sp_mark_player_sold`$$
CREATE PROCEDURE `sp_mark_player_sold`(
  IN p_auction_id BIGINT,
  IN p_user_id    BIGINT
)
BEGIN
  DECLARE v_player_id      BIGINT DEFAULT NULL;
  DECLARE v_team_id        BIGINT DEFAULT NULL;
  DECLARE v_bid_amount     DECIMAL(12,2) DEFAULT 0;
  DECLARE v_player_name    VARCHAR(150) DEFAULT NULL;
  DECLARE v_team_name      VARCHAR(150) DEFAULT NULL;
  DECLARE v_unsold_count   INT DEFAULT 0;

  DECLARE v_remaining_purse   DECIMAL(12,2) DEFAULT 0;
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

  -- Get team details
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
  SET status       = 'SOLD',
      sold_team_id = v_team_id,
      sold_price   = v_bid_amount,
      sold_amount  = v_bid_amount,
      sold_at      = NOW()
  WHERE id = v_player_id AND auction_id = p_auction_id;

  -- Deduct from team purse
  UPDATE teams
  SET remaining_purse = GREATEST(0, remaining_purse - v_bid_amount),
      balance_purse   = GREATEST(0, COALESCE(balance_purse, remaining_purse) - v_bid_amount)
  WHERE id = v_team_id AND auction_id = p_auction_id;

  -- Update auction state: mark as SOLD
  UPDATE auction_state
  SET state               = 'SOLD',
      updated_by_user_id  = p_user_id,
      updated_at          = NOW()
  WHERE auction_id = p_auction_id;

  -- Log the sale
  INSERT INTO auction_action_logs
    (auction_id, player_id, team_id, action_type, new_data, performed_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, v_team_id, 'PLAYER_SOLD',
     JSON_OBJECT(
       'player_id', v_player_id, 'player_name', v_player_name,
       'team_id', v_team_id, 'team_name', v_team_name,
       'sold_amount', v_bid_amount
     ),
     p_user_id, 'Player sold');

  -- Log attempt
  INSERT INTO player_auction_attempts
    (auction_id, player_id, team_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, v_team_id, 'SOLD', COALESCE(v_unsold_count, 0) + 1, 'SOLD',
     v_bid_amount, p_user_id, 'Player sold in auction');

  -- Return full snapshot
  CALL sp_get_public_auction_snapshot(p_auction_id);
END$$


-- ------------------------------------------------------------
-- sp_mark_player_unsold(p_auction_id, p_user_id)
-- Marks the current player as UNSOLD (can be re-auctioned later).
-- Returns the full public snapshot.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS `sp_mark_player_unsold`$$
CREATE PROCEDURE `sp_mark_player_unsold`(
  IN p_auction_id BIGINT,
  IN p_user_id    BIGINT
)
BEGIN
  DECLARE v_player_id    BIGINT DEFAULT NULL;
  DECLARE v_player_name  VARCHAR(150) DEFAULT NULL;
  DECLARE v_unsold_count INT DEFAULT 0;

  -- Get current player
  SELECT current_player_id INTO v_player_id
  FROM auction_state
  WHERE auction_id = p_auction_id;

  IF v_player_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active player to mark as unsold';
  END IF;

  -- Get player info
  SELECT player_name, COALESCE(unsold_count, 0) INTO v_player_name, v_unsold_count
  FROM players WHERE id = v_player_id;

  -- Mark player as UNSOLD and increment unsold_count
  UPDATE players
  SET status         = 'UNSOLD',
      unsold_count   = v_unsold_count + 1,
      last_unsold_at = NOW(),
      auction_round  = 'UNSOLD'
  WHERE id = v_player_id AND auction_id = p_auction_id;

  -- Reset auction state
  UPDATE auction_state
  SET state               = 'UNSOLD',
      current_bid         = 0,
      highest_team_id     = NULL,
      updated_by_user_id  = p_user_id,
      updated_at          = NOW()
  WHERE auction_id = p_auction_id;

  -- Log the action
  INSERT INTO auction_action_logs
    (auction_id, player_id, action_type, new_data, performed_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, 'PLAYER_UNSOLD',
     JSON_OBJECT('player_id', v_player_id, 'player_name', v_player_name, 'unsold_count', v_unsold_count + 1),
     p_user_id, 'Player marked as unsold');

  -- Log attempt
  INSERT INTO player_auction_attempts
    (auction_id, player_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id, reason)
  VALUES
    (p_auction_id, v_player_id, 'UNSOLD', v_unsold_count + 1, 'UNSOLD',
     0, p_user_id, 'Player unsold in auction');

  -- Return full snapshot
  CALL sp_get_public_auction_snapshot(p_auction_id);
END$$

DELIMITER ;
