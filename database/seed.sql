-- SportzMitra Auction demo seed
-- Run after sportzmitra_auction.sql. Safe to run repeatedly.
USE `sportzmitra_auction`;

SET FOREIGN_KEY_CHECKS = 0;

INSERT IGNORE INTO users
  (id, name, mobile, email, status, is_mobile_verified)
VALUES
  (9001, 'Demo Auction Admin', '9000000001', 'demo.admin@example.com', 'ACTIVE', 1),
  (9002, 'Demo Super Admin', '9000000002', 'demo.super@example.com', 'ACTIVE', 1),
  (9003, 'Demo Team Owner', '9000000003', 'demo.owner@example.com', 'ACTIVE', 1);

INSERT IGNORE INTO organizations
  (id, organization_name, contact_person, contact_mobile, plan_type,
   plan_start_date, plan_expiry_date, max_auctions_allowed, status, created_by_user_id)
VALUES
  (9001, 'SportzMitra Demo League', 'Demo Admin', '9000000001', 'YEARLY',
   '2026-01-01', '2026-12-31', 10, 'ACTIVE', 9002);

INSERT IGNORE INTO user_roles (id, user_id, role)
VALUES
  (9001, 9001, 'AUCTION_ADMIN'),
  (9002, 9002, 'SUPER_ADMIN');

INSERT IGNORE INTO organization_admins (id, organization_id, user_id, status)
VALUES
  (9001, 9001, 9001, 'ACTIVE');

INSERT IGNORE INTO auctions
  (id, organization_id, created_by_user_id, auction_name, auction_code, public_slug,
   auction_date, venue, description, auction_type, total_purse_per_team,
   min_players_per_team, max_players_per_team, minimum_bid_increment, status,
   public_theme, admin_theme, auction_flow_type, next_player_selection_mode,
   players_per_team, default_base_price, default_bid_increment, is_deleted, is_active)
VALUES
  (9001, 9001, 9001, 'Demo Premier League 2026', 'DEMO2026', 'demo-premier-league-2026',
   '2026-09-15', 'SportzMitra Arena',
   'Demo auction with sold, unsold, active and available players.',
   'CATEGORY_WISE', 100000.00, 5, 11, 500.00, 'LIVE',
   'PROJECTOR_LIGHT', 'SPORTY_DARK', 'CATEGORY_UNSOLD_AFTER_EACH_CATEGORY',
   'RANDOM_WITH_ADMIN_CONFIRM', 11, 1000.00, 500.00, 0, 1);

INSERT IGNORE INTO auction_categories
  (id, auction_id, category_name, display_order, status, base_price, bid_increment)
VALUES
  (9001, 9001, 'A', 1, 'ACTIVE', 1000.00, 500.00),
  (9002, 9001, 'B', 2, 'ACTIVE', 750.00, 250.00),
  (9003, 9001, 'C', 3, 'ACTIVE', 500.00, 250.00);

INSERT IGNORE INTO teams
  (id, auction_id, team_name, owner_name, owner_mobile, total_purse, remaining_purse,
   balance_purse, status, is_deleted, team_logo_url)
VALUES
  (9001, 9001, 'Mumbai Mavericks', 'Arjun Mehta', '9000000011', 100000.00, 73500.00,
   73500.00, 'ACTIVE', 0, NULL),
  (9002, 9001, 'Delhi Dynamos', 'Neha Sharma', '9000000012', 100000.00, 82000.00,
   82000.00, 'ACTIVE', 0, NULL),
  (9003, 9001, 'Pune Panthers', 'Rohan Patil', '9000000013', 100000.00, 90000.00,
   90000.00, 'ACTIVE', 0, NULL),
  (9004, 9001, 'Chennai Chargers', 'Kavya Iyer', '9000000014', 100000.00, 100000.00,
   100000.00, 'ACTIVE', 0, NULL);

INSERT IGNORE INTO org_players
  (id, organization_id, player_name, mobile, normalized_mobile, email, area,
   default_role, default_tshirt_size, created_source)
VALUES
  (9001, 9001, 'Aarav Kulkarni', '9000000101', '9000000101', 'aarav@example.com', 'Andheri', 'BATSMAN', 'L', 'MANUAL'),
  (9002, 9001, 'Ishita Desai', '9000000102', '9000000102', 'ishita@example.com', 'Borivali', 'BOWLER', 'M', 'MANUAL'),
  (9003, 9001, 'Kabir Nair', '9000000103', '9000000103', 'kabir@example.com', 'Thane', 'ALL_ROUNDER', 'XL', 'MANUAL'),
  (9004, 9001, 'Meera Joshi', '9000000104', '9000000104', 'meera@example.com', 'Vashi', 'WICKET_KEEPER', 'S', 'MANUAL'),
  (9005, 9001, 'Dev Malhotra', '9000000105', '9000000105', 'dev@example.com', 'Navi Mumbai', 'BOWLER', 'L', 'MANUAL'),
  (9006, 9001, 'Zoya Khan', '9000000106', '9000000106', 'zoya@example.com', 'Powai', 'BATSMAN', 'M', 'MANUAL');

INSERT IGNORE INTO players
  (id, auction_id, organization_id, org_player_id, player_name, player_mobile,
   normalized_mobile, player_email, category, player_role, base_price, status,
   sold_team_id, sold_price, sold_amount, sold_at, tshirt_size, age, area,
   auction_round, unsold_count, last_unsold_at, batting_style, bowling_style)
VALUES
  (9001, 9001, 9001, 9001, 'Aarav Kulkarni', '9000000101', '9000000101', 'aarav@example.com',
   'A', 'BATSMAN', 1000.00, 'SOLD', 9001, 6500.00, 6500.00, '2026-09-03 10:15:00', 'L', 27, 'Andheri', 'MAIN', 0, NULL, 'RIGHT_HAND', NULL),
  (9002, 9001, 9001, 9002, 'Ishita Desai', '9000000102', '9000000102', 'ishita@example.com',
   'A', 'BOWLER', 1000.00, 'SOLD', 9002, 5000.00, 5000.00, '2026-09-03 10:25:00', 'M', 25, 'Borivali', 'MAIN', 0, NULL, 'LEFT_HAND', 'RIGHT_ARM_FAST'),
  (9003, 9001, 9001, 9003, 'Kabir Nair', '9000000103', '9000000103', 'kabir@example.com',
   'B', 'ALL_ROUNDER', 750.00, 'IN_AUCTION', NULL, NULL, 0.00, NULL, 'XL', 29, 'Thane', 'MAIN', 0, NULL, 'RIGHT_HAND', 'RIGHT_ARM_OFFBREAK'),
  (9004, 9001, 9001, 9004, 'Meera Joshi', '9000000104', '9000000104', 'meera@example.com',
   'B', 'WICKET_KEEPER', 750.00, 'AVAILABLE', NULL, NULL, 0.00, NULL, 'S', 24, 'Vashi', 'MAIN', 0, NULL, 'RIGHT_HAND', NULL),
  (9005, 9001, 9001, 9005, 'Dev Malhotra', '9000000105', '9000000105', 'dev@example.com',
   'B', 'BOWLER', 750.00, 'UNSOLD', NULL, NULL, 0.00, NULL, 'L', 31, 'Navi Mumbai', 'UNSOLD', 1, '2026-09-03 10:45:00', 'RIGHT_HAND', 'LEFT_ARM_MEDIUM'),
  (9006, 9001, 9001, 9006, 'Zoya Khan', '9000000106', '9000000106', 'zoya@example.com',
   'C', 'BATSMAN', 500.00, 'AVAILABLE', NULL, NULL, 0.00, NULL, 'M', 22, 'Powai', 'MAIN', 0, NULL, 'LEFT_HAND', NULL);

INSERT IGNORE INTO auction_state
  (id, auction_id, current_player_id, current_bid, highest_team_id, state,
   updated_by_user_id, suggested_player_id, selection_mode, current_category,
   current_round, current_bid_increment, bid_preview_updated_at)
VALUES
  (9001, 9001, 9003, 2500.00, 9003, 'BIDDING', 9001, 9003,
   'RANDOM_WITH_ADMIN_CONFIRM', 'B', 'MAIN', 500.00, '2026-09-03 11:00:00');

INSERT IGNORE INTO bids
  (id, auction_id, player_id, team_id, bid_amount, created_by_user_id)
VALUES
  (9001, 9001, 9001, 9002, 5000.00, 9001),
  (9002, 9001, 9001, 9001, 6500.00, 9001),
  (9003, 9001, 9002, 9002, 5000.00, 9001),
  (9004, 9001, 9003, 9003, 2500.00, 9001);

INSERT IGNORE INTO player_auction_attempts
  (id, auction_id, player_id, team_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id)
VALUES
  (9001, 9001, 9001, 9001, 'SOLD', 1, 'SOLD', 6500.00, 9001),
  (9002, 9001, 9002, 9002, 'SOLD', 1, 'SOLD', 5000.00, 9001),
  (9003, 9001, 9005, NULL, 'UNSOLD', 1, 'UNSOLD', 0.00, 9001);

INSERT IGNORE INTO auction_action_logs
  (id, auction_id, player_id, team_id, action_type, old_data, new_data, performed_by_user_id, reason)
VALUES
  (9001, 9001, NULL, NULL, 'AUCTION_CREATED', NULL, JSON_OBJECT('auction_id', 9001), 9001, 'Demo seed'),
  (9002, 9001, 9001, 9001, 'PLAYER_SOLD', NULL, JSON_OBJECT('team_id', 9001, 'sold_price', 6500), 9001, 'Demo seed'),
  (9003, 9001, 9002, 9002, 'PLAYER_SOLD', NULL, JSON_OBJECT('team_id', 9002, 'sold_price', 5000), 9001, 'Demo seed'),
  (9004, 9001, 9005, NULL, 'PLAYER_UNSOLD', NULL, JSON_OBJECT('reason', 'No bids'), 9001, 'Demo seed');

INSERT IGNORE INTO team_purse_transactions
  (id, auction_id, team_id, transaction_type, amount, reason, created_by_user_id)
VALUES
  (9001, 9001, 9001, 'DEBIT', 6500.00, 'Aarav Kulkarni sold price', 9001),
  (9002, 9001, 9002, 'DEBIT', 5000.00, 'Ishita Desai sold price', 9001);

INSERT IGNORE INTO import_batches
  (id, organization_id, auction_id, source_type, source_name, file_name,
   total_rows, success_rows, failed_rows, imported_by_user_id)
VALUES
  (9001, 9001, 9001, 'EXCEL', 'Demo Players', 'demo-players.xlsx', 6, 6, 0, 9001);

INSERT IGNORE INTO notification_queue
  (id, auction_id, event_type, recipient_type, recipient_mobile, message_body, channel, status)
VALUES
  (9001, 9001, 'PLAYER_SOLD', 'PLAYER', '9000000101', 'Congratulations Aarav! You were sold to Mumbai Mavericks for 6500.', 'WHATSAPP', 'PENDING'),
  (9002, 9001, 'PLAYER_SOLD', 'TEAM_OWNER', '9000000012', 'Ishita Desai purchased for 5000 by Delhi Dynamos.', 'WHATSAPP', 'PENDING');

INSERT IGNORE INTO otp_requests
  (id, mobile, otp_hash, purpose, expires_at, status, is_used)
VALUES
  (9001, '9000000001', '123456', 'LOGIN', '2030-12-31 23:59:59', 'PENDING', 0);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Demo seed loaded' AS message;
SELECT id, auction_name, auction_code, status FROM auctions WHERE id = 9001;
SELECT status, COUNT(*) AS player_count FROM players WHERE auction_id = 9001 GROUP BY status;
