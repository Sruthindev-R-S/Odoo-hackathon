const pool = require("../config/db_connect");
const { hashPassword, verifyPassword } = require("../config/argon");

async function createCompanyUser(name, email, password, role) {
	const passwordHash = await hashPassword(password);
	const status = role.toUpperCase() === "ADMIN";
	const query = `
		INSERT INTO company_users (name, email, password, role, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, email, role, status;
	`;

	const { rows } = await pool.query(query, [
		name,
		email,
		passwordHash,
		role,
		status,
	]);
	return rows[0];
}

async function getCompanyUserByCredentials(name, password) {
	const query = `
		SELECT id, name, email, role, status, password
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

async function acceptEmployee(id) {
	const query = `
		UPDATE company_users
		SET status = TRUE
		WHERE id = $1
		RETURNING id, name, email, role, status;
	`;

	const { rows } = await pool.query(query, [id]);
	return rows[0] || null;
}

module.exports = {
	createCompanyUser,
	getCompanyUserByCredentials,
	acceptEmployee,
};
