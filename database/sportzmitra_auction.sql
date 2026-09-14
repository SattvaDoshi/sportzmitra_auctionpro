CREATE DATABASE  IF NOT EXISTS `sportzmitra_auction` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `sportzmitra_auction`;
-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: sportzmitra_auction
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `auction_action_logs`
--

DROP TABLE IF EXISTS `auction_action_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auction_action_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `player_id` bigint DEFAULT NULL,
  `team_id` bigint DEFAULT NULL,
  `action_type` enum('AUCTION_CREATED','PLAYER_SELECTED','BID_PLACED','PLAYER_SOLD','PLAYER_UNSOLD','UNDO','AUCTION_PAUSED','AUCTION_COMPLETED') NOT NULL,
  `old_data` json DEFAULT NULL,
  `new_data` json DEFAULT NULL,
  `performed_by_user_id` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_logs_team` (`team_id`),
  KEY `fk_logs_user` (`performed_by_user_id`),
  KEY `idx_logs_auction` (`auction_id`),
  KEY `idx_logs_player` (`player_id`),
  KEY `idx_logs_action` (`action_type`),
  CONSTRAINT `fk_logs_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_logs_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_user` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auction_action_logs`
--

LOCK TABLES `auction_action_logs` WRITE;
/*!40000 ALTER TABLE `auction_action_logs` DISABLE KEYS */;
INSERT INTO `auction_action_logs` VALUES (1,1,1,NULL,'PLAYER_SELECTED',NULL,'{\"player_id\": 1}',2,'2026-06-25 11:20:18',NULL),(2,1,1,7,'BID_PLACED',NULL,'{\"bid_amount\": 1000}',2,'2026-06-25 11:24:05',NULL),(3,1,1,2,'BID_PLACED','{\"previous_bid\": 1000.00}','{\"team_id\": 2, \"bid_amount\": 1500.00}',2,'2026-06-25 18:50:08',NULL),(4,1,1,2,'PLAYER_SOLD',NULL,'{\"team_id\": 2, \"team_name\": \"Ambika Lions\", \"sold_price\": 1500.00}',2,'2026-06-29 08:14:25',NULL),(5,1,2,NULL,'PLAYER_SELECTED',NULL,'{\"player_id\": 2}',2,'2026-06-29 08:14:41',NULL),(6,1,2,2,'BID_PLACED','{\"previous_bid\": 0.00}','{\"team_id\": 2, \"bid_amount\": 1526.00}',2,'2026-06-29 08:15:22',NULL),(7,1,2,2,'PLAYER_SOLD',NULL,'{\"team_id\": 2, \"team_name\": \"Ambika Lions\", \"sold_price\": 5000.00}',2,'2026-07-15 10:16:59',NULL),(8,1,3,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 3, \"base_price\": 500.00}',2,'2026-07-15 10:17:27',NULL),(9,1,4,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 4, \"base_price\": 200.00}',2,'2026-07-15 10:18:06',NULL),(10,1,4,2,'PLAYER_SOLD',NULL,'{\"team_id\": 2, \"team_name\": \"Ambika Lions\", \"sold_price\": 200.00}',2,'2026-07-15 10:22:30',NULL),(11,1,5,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 5, \"base_price\": 1000.00}',2,'2026-07-15 10:22:40',NULL),(12,1,5,7,'PLAYER_SOLD',NULL,'{\"team_id\": 7, \"team_name\": \"ASHOKA NEXUS\", \"sold_price\": 1000.00}',2,'2026-07-16 23:47:25',NULL),(13,1,5,NULL,'PLAYER_UNSOLD',NULL,NULL,2,'2026-07-21 07:43:43',NULL),(14,1,15,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 15, \"base_price\": 500.00}',2,'2026-07-21 07:43:43',NULL),(15,1,6,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 6, \"base_price\": 500.00}',2,'2026-07-22 09:40:26',NULL),(16,1,7,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 7, \"base_price\": 500.00}',2,'2026-07-22 09:40:28',NULL),(17,1,25,NULL,'PLAYER_SELECTED',NULL,'{\"increment\": 100.00, \"player_id\": 25, \"base_price\": 500.00}',2,'2026-07-22 09:40:31',NULL),(18,1,25,36,'PLAYER_SOLD',NULL,'{\"team_id\": 36, \"team_name\": \"Ashoka Royals29\", \"sold_price\": 5000.00}',2,'2026-08-27 10:18:35',NULL),(19,1,30,NULL,'PLAYER_SELECTED',NULL,'{\"player_id\": 30, \"base_price\": 500.00, \"bid_increment\": 100.00}',2,'2026-08-27 10:18:35',NULL),(20,1,30,7,'PLAYER_SOLD',NULL,'{\"team_id\": 7, \"team_name\": \"ASHOKA NEXUS\", \"sold_price\": 500.00}',2,'2026-08-27 10:18:55',NULL),(21,1,20,NULL,'PLAYER_SELECTED',NULL,'{\"player_id\": 20, \"base_price\": 500.00, \"bid_increment\": 100.00}',2,'2026-08-27 10:18:55',NULL),(22,1,20,NULL,'PLAYER_UNSOLD',NULL,NULL,2,'2026-08-27 10:19:05',NULL),(23,1,23,NULL,'PLAYER_SELECTED',NULL,'{\"player_id\": 23, \"base_price\": 500.00, \"bid_increment\": 100.00}',2,'2026-08-27 10:19:05',NULL);
/*!40000 ALTER TABLE `auction_action_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auction_categories`
--

DROP TABLE IF EXISTS `auction_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auction_categories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `display_order` int DEFAULT '0',
  `status` varchar(30) DEFAULT 'PENDING',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `base_price` decimal(12,2) DEFAULT '0.00',
  `bid_increment` decimal(12,2) DEFAULT NULL,
  `max_players_per_team` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auction_category` (`auction_id`,`category_name`),
  KEY `idx_auction_categories_auction` (`auction_id`),
  KEY `idx_auction_categories_order` (`auction_id`,`display_order`),
  KEY `idx_auction_categories_status` (`auction_id`,`status`,`display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auction_categories`
--

LOCK TABLES `auction_categories` WRITE;
/*!40000 ALTER TABLE `auction_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `auction_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auction_state`
--

DROP TABLE IF EXISTS `auction_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auction_state` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `current_player_id` bigint DEFAULT NULL,
  `current_bid` decimal(12,2) DEFAULT '0.00',
  `highest_team_id` bigint DEFAULT NULL,
  `state` enum('NOT_STARTED','PLAYER_ACTIVE','BIDDING','SOLD','UNSOLD','PAUSED','COMPLETED') DEFAULT 'NOT_STARTED',
  `updated_by_user_id` bigint DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `suggested_player_id` bigint DEFAULT NULL,
  `selection_mode` varchar(80) DEFAULT 'RANDOM_WITH_ADMIN_CONFIRM',
  `current_category` varchar(100) DEFAULT NULL,
  `current_round` varchar(30) DEFAULT 'MAIN',
  `current_bid_increment` decimal(12,2) DEFAULT NULL,
  `bid_preview_updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auction_id` (`auction_id`),
  KEY `fk_state_current_player` (`current_player_id`),
  KEY `fk_state_highest_team` (`highest_team_id`),
  KEY `fk_state_updated_by` (`updated_by_user_id`),
  KEY `idx_auction_state_auction` (`auction_id`),
  CONSTRAINT `fk_state_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_state_current_player` FOREIGN KEY (`current_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_state_highest_team` FOREIGN KEY (`highest_team_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_state_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auction_state`
--

LOCK TABLES `auction_state` WRITE;
/*!40000 ALTER TABLE `auction_state` DISABLE KEYS */;
INSERT INTO `auction_state` VALUES (1,1,23,500.00,NULL,'PLAYER_ACTIVE',2,'2026-08-27 10:19:05',23,'RANDOM','A','MAIN',100.00,'2026-08-27 10:18:52'),(2,2,NULL,0.00,NULL,'NOT_STARTED',NULL,'2026-06-24 18:29:06',NULL,'RANDOM_WITH_ADMIN_CONFIRM',NULL,'MAIN',NULL,NULL),(3,3,NULL,0.00,NULL,'NOT_STARTED',NULL,'2026-06-25 19:06:31',NULL,'RANDOM_WITH_ADMIN_CONFIRM',NULL,'MAIN',NULL,NULL);
/*!40000 ALTER TABLE `auction_state` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auctions`
--

DROP TABLE IF EXISTS `auctions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auctions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `auction_name` varchar(200) NOT NULL,
  `auction_code` varchar(50) NOT NULL,
  `public_slug` varchar(150) NOT NULL,
  `auction_date` date DEFAULT NULL,
  `venue` varchar(250) DEFAULT NULL,
  `description` text,
  `auction_type` varchar(50) DEFAULT 'GENERAL',
  `total_purse_per_team` decimal(12,2) DEFAULT '0.00',
  `min_players_per_team` int DEFAULT '0',
  `max_players_per_team` int DEFAULT '0',
  `minimum_bid_increment` decimal(12,2) DEFAULT '100.00',
  `status` varchar(50) DEFAULT 'PUBLISHED',
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `sponsor_banner_url` varchar(500) DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `public_theme` varchar(50) DEFAULT 'PROJECTOR_LIGHT',
  `admin_theme` varchar(50) DEFAULT 'SPORTY_DARK',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `auction_flow_type` varchar(100) DEFAULT NULL,
  `next_player_selection_mode` varchar(80) DEFAULT 'RANDOM_WITH_ADMIN_CONFIRM',
  `auction_logo_url` varchar(500) DEFAULT NULL,
  `sponsor_logo_url` varchar(500) DEFAULT NULL,
  `sponsor_logo_urls` text,
  `players_per_team` int DEFAULT '0',
  `default_base_price` decimal(12,2) DEFAULT '0.00',
  `category_flow` varchar(100) DEFAULT NULL,
  `settings_json` json DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by_user_id` bigint DEFAULT NULL,
  `default_bid_increment` decimal(12,2) DEFAULT '100.00',
  `is_active` tinyint(1) DEFAULT '1',
  `inactivated_at` datetime DEFAULT NULL,
  `inactivated_by_user_id` bigint DEFAULT NULL,
  `default_purse_per_team` decimal(12,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `auction_code` (`auction_code`),
  UNIQUE KEY `public_slug` (`public_slug`),
  KEY `fk_auctions_created_by` (`created_by_user_id`),
  KEY `idx_auctions_org` (`organization_id`),
  KEY `idx_auctions_status` (`status`),
  KEY `idx_auctions_public_slug` (`public_slug`),
  KEY `idx_auctions_code` (`auction_code`),
  KEY `idx_auctions_org_status` (`organization_id`,`status`),
  KEY `idx_auctions_org_deleted` (`organization_id`,`is_deleted`),
  KEY `idx_auctions_org_active` (`organization_id`,`is_active`),
  CONSTRAINT `fk_auctions_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_auctions_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auctions`
--

LOCK TABLES `auctions` WRITE;
/*!40000 ALTER TABLE `auctions` DISABLE KEYS */;
INSERT INTO `auctions` VALUES (1,1,2,'BPL Season 9 Auction','BPLS9AUC','bpl-season-9-auction','2026-06-18','Bhayander West',NULL,'GENERAL',10000.00,12,12,100.00,'LIVE','2026-06-29 08:14:41',NULL,NULL,NULL,'PROJECTOR_LIGHT','SPORTY_DARK','2026-06-24 01:50:38','2026-08-01 02:18:54','GENERAL','RANDOM','http://localhost:5000/uploads/auction-logos/auction-logo-1782739048140-148053856.png',NULL,NULL,12,0.00,NULL,NULL,0,NULL,NULL,100.00,1,NULL,NULL,0.00),(2,2,3,'Test Auction - season 1','AUC1782305946301','test-auction-season-1-1782305946302',NULL,'bhayander',NULL,'CATEGORY_WISE',10000.00,10,10,100.00,'PUBLISHED',NULL,NULL,NULL,NULL,'PROJECTOR_LIGHT','SPORTY_DARK','2026-06-24 18:29:06','2026-08-01 09:54:48','CATEGORY_UNSOLD_AFTER_EACH_CATEGORY','RANDOM_WITH_ADMIN_CONFIRM',NULL,NULL,NULL,10,0.00,'CATEGORY_UNSOLD_AFTER_EACH_CATEGORY',NULL,0,NULL,NULL,100.00,1,NULL,NULL,0.00),(3,1,2,'BPL Season 10','AUC1782394591169','bpl-season-10-1782394591169','2026-07-10',NULL,NULL,'GENERAL',10000.00,10,10,100.00,'PUBLISHED',NULL,NULL,NULL,NULL,'PROJECTOR_LIGHT','SPORTY_DARK','2026-06-25 19:06:31','2026-08-01 09:54:48','GENERAL','RANDOM_WITH_ADMIN_CONFIRM',NULL,NULL,NULL,10,0.00,NULL,NULL,0,NULL,NULL,100.00,1,NULL,NULL,0.00);
/*!40000 ALTER TABLE `auctions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bids`
--

DROP TABLE IF EXISTS `bids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `player_id` bigint NOT NULL,
  `team_id` bigint NOT NULL,
  `bid_amount` decimal(12,2) NOT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_bids_created_by` (`created_by_user_id`),
  KEY `idx_bids_player` (`player_id`),
  KEY `idx_bids_auction` (`auction_id`),
  KEY `idx_bids_team` (`team_id`),
  KEY `idx_bids_auction_player` (`auction_id`,`player_id`),
  CONSTRAINT `fk_bids_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bids_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bids_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bids_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bids`
--

LOCK TABLES `bids` WRITE;
/*!40000 ALTER TABLE `bids` DISABLE KEYS */;
INSERT INTO `bids` VALUES (1,1,1,7,1000.00,2,'2026-06-25 11:24:05'),(2,1,1,2,1500.00,2,'2026-06-25 18:50:08'),(3,1,2,2,1526.00,2,'2026-06-29 08:15:22');
/*!40000 ALTER TABLE `bids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `import_batch_errors`
--

DROP TABLE IF EXISTS `import_batch_errors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `import_batch_errors` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `import_batch_id` bigint NOT NULL,
  `row_number` int DEFAULT NULL,
  `raw_data` json DEFAULT NULL,
  `error_message` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_import_errors_batch` (`import_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `import_batch_errors`
--

LOCK TABLES `import_batch_errors` WRITE;
/*!40000 ALTER TABLE `import_batch_errors` DISABLE KEYS */;
/*!40000 ALTER TABLE `import_batch_errors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `import_batches`
--

DROP TABLE IF EXISTS `import_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `import_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `auction_id` bigint DEFAULT NULL,
  `source_type` varchar(50) NOT NULL,
  `source_name` varchar(200) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `total_rows` int DEFAULT '0',
  `success_rows` int DEFAULT '0',
  `failed_rows` int DEFAULT '0',
  `imported_by_user_id` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_import_batches_org` (`organization_id`),
  KEY `idx_import_batches_auction` (`auction_id`),
  KEY `idx_import_batches_source` (`source_type`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `import_batches`
--

LOCK TABLES `import_batches` WRITE;
/*!40000 ALTER TABLE `import_batches` DISABLE KEYS */;
INSERT INTO `import_batches` VALUES (1,1,1,'EXCEL','Players','sportzmitra-players-template (1).xlsx',25,25,0,2,'2026-07-16 23:50:36');
/*!40000 ALTER TABLE `import_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_queue`
--

DROP TABLE IF EXISTS `notification_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint DEFAULT NULL,
  `event_type` enum('PLAYER_SOLD','PLAYER_UNSOLD','AUCTION_STARTED','AUCTION_COMPLETED','OTP','GENERAL') DEFAULT 'GENERAL',
  `recipient_type` enum('PLAYER','TEAM_OWNER','ADMIN','PUBLIC') DEFAULT 'PUBLIC',
  `recipient_mobile` varchar(20) DEFAULT NULL,
  `recipient_email` varchar(150) DEFAULT NULL,
  `message_template` varchar(150) DEFAULT NULL,
  `message_body` text,
  `template_variables_json` json DEFAULT NULL,
  `channel` enum('WHATSAPP','SMS','EMAIL') DEFAULT 'WHATSAPP',
  `status` enum('PENDING','SENT','FAILED','RETRY') DEFAULT 'PENDING',
  `retry_count` int DEFAULT '0',
  `error_message` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `sent_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_status` (`status`),
  KEY `idx_notifications_auction` (`auction_id`),
  CONSTRAINT `fk_notification_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_queue`
--

LOCK TABLES `notification_queue` WRITE;
/*!40000 ALTER TABLE `notification_queue` DISABLE KEYS */;
INSERT INTO `notification_queue` VALUES (1,1,'PLAYER_SOLD','PLAYER','9111111111',NULL,NULL,'Congratulations Rahul Jain! You are sold to Ambika Lions for 1500.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-06-29 08:14:25',NULL),(2,1,'PLAYER_SOLD','TEAM_OWNER','9000000002',NULL,NULL,'Player purchased: Rahul Jain for 1500.00. Team: Ambika Lions',NULL,'WHATSAPP','PENDING',0,NULL,'2026-06-29 08:14:25',NULL),(3,1,'PLAYER_SOLD','PLAYER','9222222222',NULL,NULL,'Congratulations Amit Shah! You are sold to Ambika Lions for 5000.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-15 10:16:59',NULL),(4,1,'PLAYER_SOLD','TEAM_OWNER','9000000002',NULL,NULL,'Player purchased: Amit Shah for 5000.00. Team: Ambika Lions',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-15 10:16:59',NULL),(5,1,'PLAYER_SOLD','PLAYER','9444444444',NULL,NULL,'Congratulations Sagar Jain! You are sold to Ambika Lions for 200.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-15 10:22:30',NULL),(6,1,'PLAYER_SOLD','TEAM_OWNER','9000000002',NULL,NULL,'Player purchased: Sagar Jain for 200.00. Team: Ambika Lions',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-15 10:22:30',NULL),(7,1,'PLAYER_SOLD','PLAYER','99209807',NULL,NULL,'Congratulations Vishal Jain! You are sold to ASHOKA NEXUS for 1000.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-16 23:47:25',NULL),(8,1,'PLAYER_SOLD','TEAM_OWNER','999999999',NULL,NULL,'Player purchased: Vishal Jain for 1000.00. Team: ASHOKA NEXUS',NULL,'WHATSAPP','PENDING',0,NULL,'2026-07-16 23:47:25',NULL),(9,1,'PLAYER_SOLD','PLAYER','9111111111',NULL,NULL,'Congratulations Rahul Jain20! You are sold to Ashoka Royals29 for 5000.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-08-27 10:18:35',NULL),(10,1,'PLAYER_SOLD','TEAM_OWNER','9000000001',NULL,NULL,'Player purchased: Rahul Jain20 for 5000.00. Team: Ashoka Royals29',NULL,'WHATSAPP','PENDING',0,NULL,'2026-08-27 10:18:35',NULL),(11,1,'PLAYER_SOLD','PLAYER','9111111111',NULL,NULL,'Congratulations Rahul Jain25! You are sold to ASHOKA NEXUS for 500.00 in BPL Season 9 Auction',NULL,'WHATSAPP','PENDING',0,NULL,'2026-08-27 10:18:55',NULL),(12,1,'PLAYER_SOLD','TEAM_OWNER','999999999',NULL,NULL,'Player purchased: Rahul Jain25 for 500.00. Team: ASHOKA NEXUS',NULL,'WHATSAPP','PENDING',0,NULL,'2026-08-27 10:18:55',NULL);
/*!40000 ALTER TABLE `notification_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `org_players`
--

DROP TABLE IF EXISTS `org_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `org_players` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `player_name` varchar(150) NOT NULL,
  `mobile` varchar(20) DEFAULT NULL,
  `normalized_mobile` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `area` varchar(150) DEFAULT NULL,
  `default_role` varchar(100) DEFAULT NULL,
  `default_tshirt_size` varchar(20) DEFAULT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `original_photo_url` varchar(500) DEFAULT NULL,
  `photo_source` varchar(50) DEFAULT NULL,
  `photo_processing_status` varchar(50) DEFAULT NULL,
  `photo_processing_mode` varchar(80) DEFAULT NULL,
  `photo_updated_at` datetime DEFAULT NULL,
  `created_source` varchar(50) DEFAULT 'MANUAL',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org_players_mobile` (`organization_id`,`normalized_mobile`),
  KEY `idx_org_players_org` (`organization_id`),
  KEY `idx_org_players_name` (`player_name`),
  KEY `idx_org_players_email` (`organization_id`,`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `org_players`
--

LOCK TABLES `org_players` WRITE;
/*!40000 ALTER TABLE `org_players` DISABLE KEYS */;
INSERT INTO `org_players` VALUES (1,1,'Rahul Jain','9111111111','9111111111',NULL,'Bhayander','ALL_ROUNDER','XL','http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','http://localhost:5000/uploads/players/original/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-original.jpg','MANUAL','PROCESSED','face_focused_safe_crop','2026-07-21 07:24:16','MIGRATED','2026-06-26 15:11:40','2026-07-21 07:24:16'),(2,1,'Amit Shah','9222222222','9222222222',NULL,'Borivali','BATSMAN','L','http://localhost:5000/uploads/players/processed/player-1782739799901-4f789bd6-84d1-4227-9143-f6d1f4f2ae27-face.jpg','http://localhost:5000/uploads/players/original/player-1782739799901-4f789bd6-84d1-4227-9143-f6d1f4f2ae27-original.jpg','MANUAL','PROCESSED','face_focused_safe_crop','2026-06-29 19:00:05','MIGRATED','2026-06-26 15:11:40','2026-06-29 19:00:05'),(3,1,'Karan Mehta','9333333333','9333333333',NULL,'Mira Road','BOWLER','M','http://localhost:5000/uploads/players/processed/player-1784089565006-b65cb225-4df4-4961-9d46-785df6ee24bd-face.jpg','http://localhost:5000/uploads/players/original/player-1784089565006-b65cb225-4df4-4961-9d46-785df6ee24bd-original.jpg','MANUAL','PROCESSED','face_focused_safe_crop','2026-07-15 09:56:08','MIGRATED','2026-06-26 15:11:40','2026-07-15 09:56:08'),(4,1,'Sagar Jain','9444444444','9444444444',NULL,'Bhayander','WICKET_KEEPER','XXL','http://localhost:5000/uploads/players/processed/player-1784090904254-98d22062-817a-43b7-84a6-b7b59725c7de-face.jpg','http://localhost:5000/uploads/players/original/player-1784090904254-98d22062-817a-43b7-84a6-b7b59725c7de-original.jpg','MANUAL','PROCESSED','face_focused_safe_crop','2026-07-15 10:18:25','MIGRATED','2026-06-26 15:11:40','2026-07-15 10:18:25'),(8,1,'Vishal Jain','99209807','99209807','visj4u@gmail.com','bhayander','all rounder','L','http://localhost:5000/uploads/players/processed/player-1782467085878-30caf7d5-afd8-4ed6-973b-6d9477f908ce-face.jpg','http://localhost:5000/uploads/players/original/player-1782467085878-30caf7d5-afd8-4ed6-973b-6d9477f908ce-original.jpg','MANUAL','PROCESSED','face_focused_safe_crop','2026-06-26 15:15:33','MANUAL','2026-06-26 15:15:33','2026-06-26 15:15:33');
/*!40000 ALTER TABLE `org_players` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `organization_admins`
--

DROP TABLE IF EXISTS `organization_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organization_admins` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `status` enum('ACTIVE','INACTIVE','REMOVED') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org_admin` (`organization_id`,`user_id`),
  KEY `idx_org_admin_user` (`user_id`),
  KEY `idx_org_admin_org` (`organization_id`),
  KEY `idx_org_admin_user_status` (`user_id`,`status`),
  KEY `idx_org_admin_org_status` (`organization_id`,`status`),
  CONSTRAINT `fk_org_admin_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_admin_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organization_admins`
--

LOCK TABLES `organization_admins` WRITE;
/*!40000 ALTER TABLE `organization_admins` DISABLE KEYS */;
INSERT INTO `organization_admins` VALUES (1,1,2,'ACTIVE','2026-06-24 01:50:38'),(2,2,3,'ACTIVE','2026-06-24 18:27:46');
/*!40000 ALTER TABLE `organization_admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_name` varchar(200) NOT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `contact_mobile` varchar(20) DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `plan_type` enum('FREE_TRIAL','MONTHLY','YEARLY','LIFETIME') DEFAULT 'FREE_TRIAL',
  `plan_start_date` date DEFAULT NULL,
  `plan_expiry_date` date DEFAULT NULL,
  `max_auctions_allowed` int DEFAULT '1',
  `status` enum('ACTIVE','INACTIVE','EXPIRED','BLOCKED') DEFAULT 'ACTIVE',
  `created_by_user_id` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_org_created_by` (`created_by_user_id`),
  KEY `idx_organizations_status` (`status`),
  CONSTRAINT `fk_org_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organizations`
--

LOCK TABLES `organizations` WRITE;
/*!40000 ALTER TABLE `organizations` DISABLE KEYS */;
INSERT INTO `organizations` VALUES (1,'Bera Youth Brigade','Rajesh','8888888888',NULL,'FREE_TRIAL','2026-06-24','2026-07-24',2,'ACTIVE',1,'2026-06-24 01:50:38','2026-06-24 01:50:38'),(2,'TEST AUCTION','VISHAL','9920988087',NULL,'FREE_TRIAL','2026-06-24',NULL,5,'ACTIVE',1,'2026-06-24 18:27:22','2026-06-24 18:27:22');
/*!40000 ALTER TABLE `organizations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otp_requests`
--

DROP TABLE IF EXISTS `otp_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_requests` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mobile` varchar(20) NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `purpose` enum('LOGIN','VERIFY_MOBILE','RESET') DEFAULT 'LOGIN',
  `expires_at` datetime NOT NULL,
  `attempt_count` int DEFAULT '0',
  `max_attempts` int DEFAULT '3',
  `status` enum('PENDING','VERIFIED','EXPIRED','FAILED') DEFAULT 'PENDING',
  `is_used` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `verified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_otp_mobile` (`mobile`),
  KEY `idx_otp_mobile_status` (`mobile`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_requests`
--

LOCK TABLES `otp_requests` WRITE;
/*!40000 ALTER TABLE `otp_requests` DISABLE KEYS */;
INSERT INTO `otp_requests` VALUES (1,'8888888888','123456','LOGIN','2026-06-24 18:08:28',0,3,'PENDING',0,'2026-06-24 18:03:28',NULL),(2,'9999999999','123456','LOGIN','2026-06-24 18:08:51',0,3,'EXPIRED',0,'2026-06-24 18:03:51',NULL),(3,'9999999999','123456','LOGIN','2026-06-24 18:24:40',0,3,'EXPIRED',0,'2026-06-24 18:19:40',NULL),(4,'9999999999','123456','LOGIN','2026-06-24 18:31:37',0,3,'VERIFIED',1,'2026-06-24 18:26:37','2026-06-24 18:26:42'),(5,'9920988087','123456','LOGIN','2026-06-24 18:33:10',0,3,'VERIFIED',1,'2026-06-24 18:28:10','2026-06-24 18:28:14'),(6,'9999999999','123456','LOGIN','2026-06-25 11:23:12',0,3,'VERIFIED',1,'2026-06-25 11:18:12','2026-06-25 11:18:17'),(7,'8888888888','123456','LOGIN','2026-06-25 11:23:57',0,3,'VERIFIED',1,'2026-06-25 11:18:57','2026-06-25 11:19:00');
/*!40000 ALTER TABLE `otp_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `player_auction_attempts`
--

DROP TABLE IF EXISTS `player_auction_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `player_auction_attempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `player_id` bigint NOT NULL,
  `team_id` bigint DEFAULT NULL,
  `attempt_type` varchar(30) NOT NULL,
  `attempt_no` int DEFAULT '1',
  `result` varchar(30) NOT NULL,
  `bid_amount` decimal(12,2) DEFAULT '0.00',
  `created_by_user_id` bigint DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_attempts_auction` (`auction_id`),
  KEY `idx_attempts_player` (`player_id`),
  KEY `idx_attempts_result` (`result`),
  KEY `idx_attempts_auction_player` (`auction_id`,`player_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `player_auction_attempts`
--

LOCK TABLES `player_auction_attempts` WRITE;
/*!40000 ALTER TABLE `player_auction_attempts` DISABLE KEYS */;
INSERT INTO `player_auction_attempts` VALUES (1,1,5,NULL,'UNSOLD',1,'UNSOLD',0.00,2,NULL,'2026-07-21 07:43:43'),(2,1,20,NULL,'UNSOLD',1,'UNSOLD',0.00,2,NULL,'2026-08-27 10:19:05');
/*!40000 ALTER TABLE `player_auction_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `players`
--

DROP TABLE IF EXISTS `players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `players` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `organization_id` bigint DEFAULT NULL,
  `org_player_id` bigint DEFAULT NULL,
  `player_name` varchar(150) NOT NULL,
  `player_mobile` varchar(20) DEFAULT NULL,
  `normalized_mobile` varchar(20) DEFAULT NULL,
  `player_email` varchar(150) DEFAULT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `registration_source` varchar(50) DEFAULT 'MANUAL',
  `import_batch_id` bigint DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `player_role` varchar(100) DEFAULT 'OTHER',
  `base_price` decimal(12,2) DEFAULT '0.00',
  `status` enum('AVAILABLE','IN_AUCTION','SOLD','UNSOLD','WITHDRAWN') DEFAULT 'AVAILABLE',
  `sold_team_id` bigint DEFAULT NULL,
  `sold_price` decimal(12,2) DEFAULT NULL,
  `sold_at` datetime DEFAULT NULL,
  `tshirt_size` varchar(20) DEFAULT NULL,
  `age` int DEFAULT NULL,
  `area` varchar(150) DEFAULT NULL,
  `previous_team` varchar(150) DEFAULT NULL,
  `extra_data` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `auction_round` varchar(30) DEFAULT 'MAIN',
  `unsold_count` int DEFAULT '0',
  `last_unsold_at` datetime DEFAULT NULL,
  `final_unsold_at` datetime DEFAULT NULL,
  `batting_style` varchar(100) DEFAULT NULL,
  `bowling_style` varchar(100) DEFAULT NULL,
  `sold_amount` decimal(12,2) DEFAULT '0.00',
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_players_auction` (`auction_id`),
  KEY `idx_players_status` (`status`),
  KEY `idx_players_auction_status` (`auction_id`,`status`),
  KEY `idx_players_sold_team` (`sold_team_id`),
  KEY `idx_players_org` (`organization_id`),
  KEY `idx_players_org_player` (`org_player_id`),
  KEY `idx_players_mobile_norm` (`organization_id`,`normalized_mobile`),
  KEY `idx_players_import_batch` (`import_batch_id`),
  KEY `idx_players_round_status` (`auction_id`,`auction_round`,`status`),
  KEY `idx_players_category_status` (`auction_id`,`category`,`status`),
  KEY `idx_players_auction_deleted` (`auction_id`,`is_deleted`),
  CONSTRAINT `fk_players_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_players_sold_team` FOREIGN KEY (`sold_team_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `players`
--

LOCK TABLES `players` WRITE;
/*!40000 ALTER TABLE `players` DISABLE KEYS */;
INSERT INTO `players` VALUES (1,1,1,1,'Rahul Jain','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','MANUAL',NULL,'A','ALL_ROUNDER',500.00,'SOLD',2,1500.00,'2026-06-29 08:14:25','XL',31,'Bhayander',NULL,NULL,'2026-06-24 01:50:38','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(2,1,1,2,'Amit Shah','9222222222','9222222222',NULL,'http://localhost:5000/uploads/players/processed/player-1782739799901-4f789bd6-84d1-4227-9143-f6d1f4f2ae27-face.jpg','MANUAL',NULL,'B','BATSMAN',300.00,'SOLD',2,5000.00,'2026-07-15 10:16:59','L',29,'Borivali',NULL,NULL,'2026-06-24 01:50:38','2026-07-15 10:16:59','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(3,1,1,3,'Karan Mehta','9333333333','9333333333',NULL,'http://localhost:5000/uploads/players/processed/player-1784089565006-b65cb225-4df4-4961-9d46-785df6ee24bd-face.jpg','MANUAL',NULL,'A','BOWLER',500.00,'IN_AUCTION',NULL,NULL,NULL,'M',27,'Mira Road',NULL,NULL,'2026-06-24 01:50:38','2026-07-15 10:17:27','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(4,1,1,4,'Sagar Jain','9444444444','9444444444',NULL,'http://localhost:5000/uploads/players/processed/player-1784090904254-98d22062-817a-43b7-84a6-b7b59725c7de-face.jpg','MANUAL',NULL,'C','WICKET_KEEPER',200.00,'SOLD',2,200.00,'2026-07-15 10:22:30','XXL',35,'Bhayander',NULL,NULL,'2026-06-24 01:50:38','2026-07-15 10:22:30','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(5,1,1,8,'Vishal Jain','99209807','99209807','visj4u@gmail.com','http://localhost:5000/uploads/players/processed/player-1782467085878-30caf7d5-afd8-4ed6-973b-6d9477f908ce-face.jpg','MANUAL',NULL,'A','all rounder',1000.00,'SOLD',7,1000.00,'2026-07-16 23:47:25','L',40,'bhayander',NULL,NULL,'2026-06-26 15:15:33','2026-07-16 23:47:25','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(6,1,1,1,'Rahul Jain1','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'IN_AUCTION',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-22 09:40:26','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(7,1,1,1,'Rahul Jain2','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'IN_AUCTION',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-22 09:40:28','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(8,1,1,1,'Rahul Jain3','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(9,1,1,1,'Rahul Jain4','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(10,1,1,1,'Rahul Jain5','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(11,1,1,1,'Rahul Jain6','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(12,1,1,1,'Rahul Jain7','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(13,1,1,1,'Rahul Jain8','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(14,1,1,1,'Rahul Jain9','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(15,1,1,1,'Rahul Jain10','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'IN_AUCTION',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:43:43','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(16,1,1,1,'Rahul Jain11','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(17,1,1,1,'Rahul Jain12','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(18,1,1,1,'Rahul Jain13','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(19,1,1,1,'Rahul Jain14','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(20,1,1,1,'Rahul Jain15','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'UNSOLD',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-08-27 10:19:05','UNSOLD',1,'2026-08-27 10:19:05',NULL,NULL,NULL,0.00,0),(21,1,1,1,'Rahul Jain16','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(22,1,1,1,'Rahul Jain17','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(23,1,1,1,'Rahul Jain18','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'IN_AUCTION',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-08-27 10:19:05','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(24,1,1,1,'Rahul Jain19','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(25,1,1,1,'Rahul Jain20','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'SOLD',36,5000.00,'2026-08-27 10:18:35','XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-08-27 10:18:35','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(26,1,1,1,'Rahul Jain21','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(27,1,1,1,'Rahul Jain22','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(28,1,1,1,'Rahul Jain23','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(29,1,1,1,'Rahul Jain24','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'AVAILABLE',NULL,NULL,NULL,'XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-07-21 07:24:16','MAIN',0,NULL,NULL,NULL,NULL,0.00,0),(30,1,1,1,'Rahul Jain25','9111111111','9111111111',NULL,'http://localhost:5000/uploads/players/processed/player-1784598848886-dce2ef95-69af-4e9b-b4ee-115f5c08f414-face.jpg','EXCEL',1,'A','ALL_ROUNDER',500.00,'SOLD',7,500.00,'2026-08-27 10:18:55','XL',31,'Bhayander',NULL,NULL,'2026-07-16 23:50:36','2026-08-27 10:18:55','MAIN',0,NULL,NULL,NULL,NULL,0.00,0);
/*!40000 ALTER TABLE `players` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `team_purse_transactions`
--

DROP TABLE IF EXISTS `team_purse_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `team_purse_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `team_id` bigint NOT NULL,
  `transaction_type` varchar(50) NOT NULL DEFAULT 'TOPUP',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `reason` varchar(500) DEFAULT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_team_purse_auction` (`auction_id`),
  KEY `idx_team_purse_team` (`team_id`),
  KEY `idx_team_purse_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `team_purse_transactions`
--

LOCK TABLES `team_purse_transactions` WRITE;
/*!40000 ALTER TABLE `team_purse_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `team_purse_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teams`
--

DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `auction_id` bigint NOT NULL,
  `team_name` varchar(150) NOT NULL,
  `owner_name` varchar(150) DEFAULT NULL,
  `owner_mobile` varchar(20) DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `total_purse` decimal(12,2) DEFAULT '0.00',
  `remaining_purse` decimal(12,2) DEFAULT '0.00',
  `team_whatsapp_group_link` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `balance_purse` decimal(12,2) DEFAULT '0.00',
  `team_logo_url` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_team_per_auction` (`auction_id`,`team_name`),
  KEY `idx_teams_auction` (`auction_id`),
  KEY `idx_teams_auction_status` (`auction_id`,`status`),
  KEY `idx_teams_auction_deleted` (`auction_id`,`is_deleted`),
  CONSTRAINT `fk_teams_auction` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teams`
--

LOCK TABLES `teams` WRITE;
/*!40000 ALTER TABLE `teams` DISABLE KEYS */;
INSERT INTO `teams` VALUES (1,1,'Ashoka Royals','Rajesh','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-06-24 01:50:38','2026-08-19 05:48:59',1,0.00,NULL),(2,1,'Ambika Lions','Amit','9000000002','http://localhost:5000/uploads/team-logos/team-logo-1784598803045.jpeg',10000.00,3300.00,NULL,'ACTIVE','2026-06-24 01:50:38','2026-07-21 07:23:24',0,0.00,NULL),(3,1,'Parmar Warriors','Karan','9000000003',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-06-24 01:50:38','2026-08-01 10:50:30',1,0.00,NULL),(4,2,'ASHOKA ROYALS','VISHAL',NULL,'http://localhost:5000/uploads/team-logos/team-logo-1782330162399.png',10000.00,10000.00,NULL,'ACTIVE','2026-06-25 00:37:47','2026-06-25 01:12:46',0,0.00,NULL),(5,2,'RCB','KOHLI',NULL,NULL,10000.00,10000.00,NULL,'ACTIVE','2026-06-25 00:38:33','2026-06-25 00:38:33',0,0.00,NULL),(6,2,'MUMBAI INDIANS','ROHIT',NULL,NULL,10000.00,10000.00,NULL,'ACTIVE','2026-06-25 00:38:59','2026-06-25 00:38:59',0,0.00,NULL),(7,1,'ASHOKA NEXUS','ASHKA','999999999','http://localhost:5000/uploads/team-logos/team-logo-1782366564362.jpg',10000.00,8500.00,NULL,'ACTIVE','2026-06-25 11:19:57','2026-08-27 10:18:55',0,0.00,NULL),(8,1,'Ashoka Royals1','Rajesh1','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(9,1,'Ashoka Royals2','Rajesh2','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(10,1,'Ashoka Royals3','Rajesh3','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(11,1,'Ashoka Royals4','Rajesh4','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(12,1,'Ashoka Royals5','Rajesh5','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(13,1,'Ashoka Royals6','Rajesh6','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(14,1,'Ashoka Royals7','Rajesh7','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(15,1,'Ashoka Royals8','Rajesh8','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(16,1,'Ashoka Royals9','Rajesh9','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(17,1,'Ashoka Royals10','Rajesh10','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(18,1,'Ashoka Royals11','Rajesh11','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(19,1,'Ashoka Royals12','Rajesh12','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(20,1,'Ashoka Royals13','Rajesh13','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(21,1,'Ashoka Royals14','Rajesh14','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(22,1,'Ashoka Royals15','Rajesh15','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(23,1,'Ashoka Royals16','Rajesh16','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(24,1,'Ashoka Royals17','Rajesh17','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(25,1,'Ashoka Royals18','Rajesh18','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(26,1,'Ashoka Royals19','Rajesh19','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(27,1,'Ashoka Royals20','Rajesh20','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(28,1,'Ashoka Royals21','Rajesh21','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(29,1,'Ashoka Royals22','Rajesh22','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(30,1,'Ashoka Royals23','Rajesh23','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(31,1,'Ashoka Royals24','Rajesh24','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(32,1,'Ashoka Royals25','Rajesh25','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(33,1,'Ashoka Royals26','Rajesh26','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(34,1,'Ashoka Royals27','Rajesh27','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(35,1,'Ashoka Royals28','Rajesh28','9000000001',NULL,10000.00,10000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-01 10:50:30',1,0.00,NULL),(36,1,'Ashoka Royals29','Rajesh29','9000000001',NULL,10000.00,5000.00,NULL,'ACTIVE','2026-07-16 23:49:17','2026-08-27 10:18:35',1,0.00,NULL);
/*!40000 ALTER TABLE `teams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `role` enum('SUPER_ADMIN','AUCTION_ADMIN') NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_role` (`user_id`,`role`),
  KEY `idx_user_roles_user` (`user_id`),
  KEY `idx_user_roles_role` (`role`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (1,1,'SUPER_ADMIN','2026-06-24 01:50:38'),(2,2,'AUCTION_ADMIN','2026-06-24 01:50:38'),(3,3,'AUCTION_ADMIN','2026-06-24 18:27:46');
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','BLOCKED') DEFAULT 'ACTIVE',
  `is_mobile_verified` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mobile` (`mobile`),
  KEY `idx_users_mobile` (`mobile`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'SportzMitra Super Admin','9999999999','sportzmitrastore@gmail.com','ACTIVE',1,'2026-06-24 01:50:38','2026-08-27 10:21:09','2026-08-27 10:21:09'),(2,'Rajesh Auction Admin','8888888888','rajesh@example.com','ACTIVE',1,'2026-06-24 01:50:38','2026-08-27 10:23:45','2026-08-27 10:23:45'),(3,'VISHAL','9920988087','visj4u@gmail.com','ACTIVE',1,'2026-06-24 18:27:46','2026-06-24 18:28:14','2026-06-24 18:28:14');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

DROP PROCEDURE IF EXISTS `sp_check_auction_access`;
DELIMITER $$
CREATE PROCEDURE `sp_check_auction_access`(
  IN p_user_id BIGINT,
  IN p_role VARCHAR(50),
  IN p_auction_id BIGINT
)
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM auctions a
    LEFT JOIN organization_admins oa
      ON oa.organization_id = a.organization_id
     AND oa.user_id = p_user_id
     AND oa.status = 'ACTIVE'
    JOIN users u ON u.id = p_user_id AND u.status = 'ACTIVE'
    WHERE a.id = p_auction_id
      AND COALESCE(a.is_deleted, 0) = 0
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'AUCTION_ADMIN' AND oa.id IS NOT NULL)
      )
  ) AS has_access;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_get_auction_dashboard`;
DELIMITER $$
CREATE PROCEDURE `sp_get_auction_dashboard`(IN p_auction_id BIGINT)
BEGIN
  SELECT *
  FROM auctions
  WHERE id = p_auction_id
    AND COALESCE(is_deleted, 0) = 0;

  SELECT COUNT(*) AS total_teams
  FROM teams
  WHERE auction_id = p_auction_id
    AND COALESCE(is_deleted, 0) = 0;

  SELECT COUNT(*) AS total_players,
         SUM(status = 'SOLD') AS sold_players,
         SUM(status IN ('AVAILABLE', 'IN_AUCTION')) AS available_players
  FROM players
  WHERE auction_id = p_auction_id
    AND COALESCE(is_deleted, 0) = 0;

  SELECT *
  FROM auction_state
  WHERE auction_id = p_auction_id;
END$$
DELIMITER ;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-28 10:12:52


-- ============================================================
-- RECENT STORED PROCEDURES (Added to fix missing procedure errors)
-- ============================================================


DELIMITER $$
DROP PROCEDURE IF EXISTS `sp_get_public_auction_snapshot`$$
CREATE PROCEDURE `sp_get_public_auction_snapshot`(IN p_auction_id BIGINT)
BEGIN
  -- 0. Auction details
  SELECT a.*, o.organization_name 
  FROM auctions a 
  LEFT JOIN organizations o ON a.organization_id = o.id 
  WHERE a.id = p_auction_id;
  
  -- 1. State details (with current player and highest bidder team info)
  SELECT s.*, 
         p.player_name, p.category, p.player_role, p.base_price, p.photo_url, p.age, p.batting_style, p.bowling_style,
         t.team_name AS highest_team_name
  FROM auction_state s
  LEFT JOIN players p ON s.current_player_id = p.id
  LEFT JOIN teams t ON s.highest_team_id = t.id
  WHERE s.auction_id = p_auction_id;

  -- 2. Teams (used for teams and teamsSummary)
  SELECT id, team_name, owner_name, logo_url, total_purse, remaining_purse, (total_purse - remaining_purse) AS used_amount 
  FROM teams 
  WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0;

  -- 3. Sold Players
  SELECT p.*, t.team_name as sold_team_name 
  FROM players p 
  LEFT JOIN teams t ON p.sold_team_id = t.id 
  WHERE p.auction_id = p_auction_id AND p.status = 'SOLD' AND COALESCE(p.is_deleted, 0) = 0;

  -- 4. Unsold Players
  SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status = 'UNSOLD' AND COALESCE(p.is_deleted, 0) = 0;

  -- 5. Pending Players (AVAILABLE, IN_AUCTION)
  SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status IN ('AVAILABLE', 'IN_AUCTION') AND COALESCE(p.is_deleted, 0) = 0;

  -- 6. Category Summary
  SELECT category, COUNT(*) as total, SUM(status='SOLD') as sold, SUM(status='UNSOLD') as unsold, SUM(status IN ('AVAILABLE', 'IN_AUCTION')) as pending 
  FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0 
  GROUP BY category;

  -- 7. Dashboard Summary
  SELECT 
    (SELECT COUNT(*) FROM teams WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_teams,
    (SELECT COUNT(*) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_players,
    (SELECT SUM(status='SOLD') FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as sold_players;
END$$
DELIMITER ;



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
  DECLARE v_player_name VARCHAR(150);

  -- Validate player belongs to this auction
  SELECT player_name INTO v_player_name
  FROM players
  WHERE id = p_player_id AND auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0
  LIMIT 1;

  IF v_player_name IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Player not found in this auction';
  END IF;

  -- Set player status to IN_AUCTION
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

  -- Get team remaining purse
  SELECT remaining_purse INTO v_remaining_purse
  FROM teams
  WHERE id = p_team_id AND auction_id = p_auction_id AND status = 'ACTIVE';

  IF v_remaining_purse IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Team not found or inactive';
  END IF;

  IF p_bid_amount > v_remaining_purse THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bid exceeds team remaining purse';
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

  -- Get team name
  SELECT team_name INTO v_team_name
  FROM teams WHERE id = v_team_id;

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
