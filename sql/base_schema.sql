-- Casual Leave Management System - base database schema
-- Target: MySQL 8.0+ or MariaDB 10.4+
-- Usage:  mysql -u <user> -p <database> < sql/base_schema.sql
--
-- The application also creates its optional tables (audit_logs, password_history,
-- support_tickets, profile_requests, memos) on first start when the database
-- account has CREATE TABLE permission.

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` varchar(64) NOT NULL,
  `username` varchar(64) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` text NOT NULL,
  `email` varchar(320) DEFAULT NULL,
  `designation` text DEFAULT NULL,
  `department` text DEFAULT NULL,
  `role` enum('employee','hod','pa','clerk','admin') NOT NULL DEFAULT 'employee',
  `isActive` int(11) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `lastSignedIn` timestamp NULL DEFAULT NULL,
  `persNo` varchar(50) DEFAULT NULL,
  `bps` varchar(20) DEFAULT NULL,
  `requiresPasswordChange` tinyint(1) DEFAULT 0,
  `phone` varchar(255) DEFAULT NULL,
  `profile_pic` longtext DEFAULT NULL,
  `supervisor_id` int(11) DEFAULT NULL,
  `is_supervisor` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employeeId` (`employeeId`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `leaveapplications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `numberOfDays` int(11) NOT NULL,
  `leaveType` varchar(50) NOT NULL DEFAULT 'CL',
  `reason` text DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending_supervisor',
  `remarks` text DEFAULT NULL,
  `approvedBy` int(11) DEFAULT NULL,
  `approvalDate` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `isCompensated` tinyint(1) DEFAULT 0,
  `supervisor_approved_by` varchar(255) DEFAULT NULL,
  `supervisor_approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_leave_employee` (`employeeId`),
  KEY `idx_leave_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `leavebalances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `leaveType` varchar(50) NOT NULL DEFAULT 'CL',
  `totalAllocated` int(11) NOT NULL DEFAULT 12,
  `used` int(11) NOT NULL DEFAULT 0,
  `withoutPay` int(11) NOT NULL DEFAULT 0,
  `remaining` int(11) NOT NULL DEFAULT 12,
  `year` int(11) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employeeId` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `public_holidays` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `memos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `created_by_username` varchar(100) NOT NULL,
  `memo_ref` varchar(50) DEFAULT NULL,
  `to_field` text NOT NULL,
  `subject` text NOT NULL,
  `urgency` varchar(20) DEFAULT 'ROUTINE',
  `from_name` varchar(255) DEFAULT NULL,
  `from_designation` varchar(255) DEFAULT NULL,
  `pers_no` varchar(50) DEFAULT NULL,
  `main_matter` longtext DEFAULT NULL,
  `copy_to` text DEFAULT NULL,
  `enclosed_items` text DEFAULT NULL,
  `memo_date` date DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_username` (`created_by_username`),
  KEY `idx_date` (`memo_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(100) NOT NULL,
  `action` varchar(50) NOT NULL,
  `target` varchar(100) NOT NULL,
  `ip_address` varchar(255) NOT NULL,
  `timestamp` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `password_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `attachment_path` varchar(255) DEFAULT NULL,
  `attachment_name` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `profile_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `bps` varchar(255) DEFAULT NULL,
  `persNo` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `profile_pic` longtext DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `admin_remarks` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
