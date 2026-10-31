const pool = require("../config/db_connect");

async function requireCompanyUser(req, res, next) {
	const companyUserId = req.get("x-company-user-id");
	if (!companyUserId) {
		return res.status(401).json({ error: "Company user authentication is required" });
	}

	try {
		const { rows } = await pool.query(
			"SELECT id, role, status FROM company_users WHERE id = $1 AND status = TRUE",
			[companyUserId]
		);
		if (!rows[0]) return res.status(403).json({ error: "Authorized company user required" });
		req.companyUser = rows[0];
		return next();
	} catch (error) {
		console.error("Failed to authorize company user:", error);
		return res.status(500).json({ error: "Authorization failed" });
	}
}

module.exports = { requireCompanyUser };
