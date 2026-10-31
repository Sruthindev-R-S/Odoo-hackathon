const express = require("express");
const {
	createCompanyUser,
	getCompanyUserByCredentials,
} = require("../models/company_users");
const { forgotCompanyPassword } = require("../controllers/auth");

const router = express.Router();

router.post("/forgot-password", forgotCompanyPassword);

router.post("/register", async (req, res) => {
	const { name, email, password, role } = req.body;

	if (!name || !email || !password || !role) {
		return res.status(400).json({
			error: "Name, email, password, and role are required",
		});
	}

	if (password.length < 8) {
		return res.status(400).json({
			error: "Password must be at least 8 characters long",
		});
	}

	try {
		const user = await createCompanyUser(
			name.trim(),
			email.trim(),
			password,
			role.trim()
		);

		return res.status(201).json({
			message: "Company user registration successful",
			user,
		});
	} catch (error) {
		console.error("Failed to register company user:", error);
		return res.status(500).json({
			error: "Failed to register company user",
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
				error: "Invalid company user name or password",
			});
		}

		return res.json({
			message: "Company user login successful",
			user,
		});
	} catch (error) {
		console.error("Failed to log in company user:", error);
		return res.status(500).json({
			error: "Failed to log in company user",
		});
	}
});

module.exports = router;
