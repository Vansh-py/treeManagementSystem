-- Run this once against your MySQL server to set up the database.
-- Example:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS Profiles;
USE Profiles;

CREATE TABLE IF NOT EXISTS profiles (
    profile_id  INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,   -- stores a hashed password, never plain text
    admin       BOOLEAN      NOT NULL DEFAULT FALSE
);