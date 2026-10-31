const pool = require("../config/db_connect");
const { hashPassword, verifyPassword } = require("../config/argon");

async function createUser(name, email, password) {
	const passwordHash = await hashPassword(password);
	const query = `
		INSERT INTO users (name, email, password)
		VALUES ($1, $2, $3)
		RETURNING id, name, email;
	`;

	const { rows } = await pool.query(query, [name, email, passwordHash]);
	return rows[0];
}

async function getUserByCredentials(name, password) {
	const query = `
		SELECT id, name, email, password
		FROM users
		WHERE name = $1;
	`;

	const { rows } = await pool.query(query, [name]);
	const user = rows[0];

	if (!user || !(await verifyPassword(user.password, password))) {
		return null;
	}

	delete user.password;
	return user;
}

module.exports = {
	createUser,
	getUserByCredentials,
};
