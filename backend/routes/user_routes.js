const express = require("express");
const {
	createCompanyUser,
	getCompanyUserByCredentials,
} = require("../models/company_users");
const { forgotPassword } = require("../controllers/auth");
const { signAuthToken } = require("../middleware/auth");

const router = express.Router();

router.post("/forgot-password", forgotPassword);

router.post("/register", async (req, res) => {
	const { name, email, password } = req.body;

	if (!name || !email || !password) {
		return res.status(400).json({
			error: "Name, email, and password are required",
		});
	}

	if (password.length < 8) {
		return res.status(400).json({
			error: "Password must be at least 8 characters long",
		});
	}

	try {
		const user = await createCompanyUser(name.trim(), email.trim(), password);

		return res.status(201).json({
			message: "Registration successful",
			user,
			token: signAuthToken({ type: "customer", userId: user.id, role: "CUSTOMER" }),
			token: signToken({ sub: String(user.id), type: "user" }),
		});
	} catch (error) {
		console.error("Failed to register user:", error);
		return res.status(500).json({
			error: "Failed to register user",
		});
	}
});

router.post("/login", async (req, res) => {
	const { name, password } = req.body;

	if (!name || !password) {
		return res.status(400).json({
			error: "Name and password are required",
		});
	}

	try {
		const user = await getCompanyUserByCredentials(name.trim(), password);

		if (!user) {
			return res.status(401).json({
				error: "Invalid name or password",
			});
		}

		return res.json({
			message: "Login successful",
			user,
			token: signAuthToken({ type: "customer", userId: user.id, role: "CUSTOMER" }),
		});
	} catch (error) {
		console.error("Failed to log in user:", error);
		return res.status(500).json({
			error: "Failed to log in user",
		});
	}
});

module.exports = router;
