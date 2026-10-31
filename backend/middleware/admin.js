const pool = require("../config/db_connect");

async function requireAdmin(req, res, next) {
	const companyUserId = req.get("x-company-user-id");

	if (!companyUserId) {
		return res.status(401).json({ error: "Admin authentication is required" });
	}

	try {
		const { rows } = await pool.query(
			`SELECT id
			 FROM company_users
			 WHERE id = $1 AND role = 'ADMIN' AND status = TRUE`,
			[companyUserId]
		);

		if (!rows[0]) {
			return res.status(403).json({ error: "Admin access is required" });
		}

		req.admin = rows[0];
		return next();
	} catch (error) {
		console.error("Failed to authorize admin:", error);
		return res.status(500).json({ error: "Authorization failed" });
	}
}

module.exports = {
	requireAdmin,
};