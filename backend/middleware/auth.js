const jwt = require("jsonwebtoken");

function signAuthToken(payload) {
	return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });
}

function readAuthToken(req) {
	const value = req.get("authorization") || "";
	const [scheme, token] = value.split(" ");
	return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireJwt(req, res, next) {
	const token = readAuthToken(req);
	if (!token) {
		return res.status(401).json({ error: "Authentication is required" });
	}

	try {
		req.auth = jwt.verify(token, process.env.JWT_SECRET);
		return next();
	} catch {
		return res.status(401).json({ error: "Invalid or expired authentication token" });
	}
}

module.exports = { signAuthToken, requireJwt, readAuthToken };
