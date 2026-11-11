CREATE DATABASE IF NOT EXISTS freetime
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE freetime;

CREATE TABLE IF NOT EXISTS user_accounts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'stationery',
  quantity INT NOT NULL DEFAULT 0,
  is_broken BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS borrow_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  borrower_name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date DATE NULL,
  reviewed_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS item_borrows (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id INT NULL,
  item_id INT NOT NULL,
  borrower_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  borrowed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date DATE NULL,
  return_requested_at DATETIME NULL,
  return_reviewed_at DATETIME NULL,
  return_decision VARCHAR(30) NULL,
  return_condition VARCHAR(30) NULL,
  returned_at DATETIME NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'checked_out',
  CONSTRAINT fk_item_borrows_request
    FOREIGN KEY (request_id) REFERENCES borrow_requests (id),
  CONSTRAINT fk_item_borrows_item
    FOREIGN KEY (item_id) REFERENCES items (id)
);

CREATE TABLE IF NOT EXISTS item_units (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  borrowed_count INT NOT NULL DEFAULT 0,
  is_broken BOOLEAN NOT NULL DEFAULT FALSE,
  is_checked_out BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_item_units_item
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_borrow_units (
  item_borrow_id INT NOT NULL,
  item_unit_id INT NOT NULL,
  PRIMARY KEY (item_borrow_id, item_unit_id),
  CONSTRAINT fk_item_borrow_units_borrow
    FOREIGN KEY (item_borrow_id) REFERENCES item_borrows (id) ON DELETE CASCADE,
  CONSTRAINT fk_item_borrow_units_unit
    FOREIGN KEY (item_unit_id) REFERENCES item_units (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS borrow_request_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_borrow_request_items_request
    FOREIGN KEY (request_id) REFERENCES borrow_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_borrow_request_items_item
    FOREIGN KEY (item_id) REFERENCES items (id)
);

CREATE TABLE IF NOT EXISTS tools (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  serial_number VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,
  calibration_status VARCHAR(50) NOT NULL DEFAULT 'not_required',
  status VARCHAR(50) NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS requisitions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) NOT NULL UNIQUE,
  requester_name VARCHAR(150) NOT NULL,
  line_location VARCHAR(150) NOT NULL,
  urgency VARCHAR(30) NOT NULL DEFAULT 'normal',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requisition_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requisition_id INT NOT NULL,
  tool_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_requisition_items_requisition
    FOREIGN KEY (requisition_id) REFERENCES requisitions (id) ON DELETE CASCADE,
  CONSTRAINT fk_requisition_items_tool
    FOREIGN KEY (tool_id) REFERENCES tools (id)
);

CREATE TABLE IF NOT EXISTS tool_loans (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_id INT NOT NULL,
  requisition_id INT NULL,
  borrower_name VARCHAR(150) NOT NULL,
  checked_out_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NOT NULL,
  returned_at DATETIME NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'checked_out',
  CONSTRAINT fk_tool_loans_tool
    FOREIGN KEY (tool_id) REFERENCES tools (id),
  CONSTRAINT fk_tool_loans_requisition
    FOREIGN KEY (requisition_id) REFERENCES requisitions (id)
);

CREATE TABLE IF NOT EXISTS return_receipts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_code VARCHAR(50) NOT NULL UNIQUE,
  loan_id INT NOT NULL UNIQUE,
  `condition` VARCHAR(100) NOT NULL,
  received_by VARCHAR(150) NOT NULL,
  returned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_return_receipts_loan
    FOREIGN KEY (loan_id) REFERENCES tool_loans (id)
);
