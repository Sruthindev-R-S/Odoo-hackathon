const pool = require("../config/db_connect");
const { hashPassword, verifyPassword } = require("../config/argon");

async function createCompanyUser(name, email, password, role) {
	const passwordHash = await hashPassword(password);
	const query = `
		INSERT INTO company_users (name, email, password, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, email, role;
	`;

	const { rows } = await pool.query(query, [name, email, passwordHash, role]);
	return rows[0];
}

async function getCompanyUserByCredentials(name, password) {
	const query = `
		SELECT id, name, email, role, password
		FROM company_users
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
	createCompanyUser,
	getCompanyUserByCredentials,
};
