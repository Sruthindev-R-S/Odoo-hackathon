const pool = require("../config/db_connect");

async function createBlog(name, blog) {
	const query = `
		INSERT INTO blog (name, blog)
		VALUES ($1, $2)
		RETURNING id, name, blog;
	`;

	const { rows } = await pool.query(query, [name, blog]);
	return rows[0];
}

async function getBlogs() {
	const { rows } = await pool.query(
		"SELECT id, name, blog FROM blog ORDER BY id DESC",
	);

	return rows;
}

module.exports = {
	createBlog,
	getBlogs,
};
