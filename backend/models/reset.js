const pool = require("../config/db_connect");

async function createPasswordResetTokensTable() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS password_reset_tokens (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token_hash VARCHAR(64) NOT NULL UNIQUE,
			expires_at TIMESTAMP NOT NULL,
			used_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`);
}

module.exports = {
	createPasswordResetTokensTable,
};
