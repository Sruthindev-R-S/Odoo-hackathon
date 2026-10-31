const express = require("express");
const {
	createUser,
	getUserByCredentials,
} = require("../models/user");
const { createBlog, getBlogs } = require("../models/blog");

const router = express.Router();

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
		const user = await createUser(name.trim(), email.trim(), password);

		return res.status(201).json({
			message: "Registration successful",
			user,
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
		const user = await getUserByCredentials(name.trim(), password);

		if (!user) {
			return res.status(401).json({
				error: "Invalid name or password",
			});
		}

		return res.json({
			message: "Login successful",
			user,
		});
	} catch (error) {
		console.error("Failed to log in user:", error);
		return res.status(500).json({
			error: "Failed to log in user",
		});
	}
});

router.post("/blog", async (req, res) => {
	const { name, blog } = req.body;

	if (!name || !blog) {
		return res.status(400).json({
			error: "Name and blog are required",
		});
	}

	try {
		const createdBlog = await createBlog(name.trim(), blog.trim());

		return res.status(201).json({
			message: "Blog created successfully",
			blog: createdBlog,
		});
	} catch (error) {
		console.error("Failed to create blog:", error);
		return res.status(500).json({
			error: "Failed to create blog",
		});
	}
});

router.get("/blog", async (req, res) => {
	try {
		const blogs = await getBlogs();
		return res.json(blogs);
	} catch (error) {
		console.error("Failed to retrieve blogs:", error);
		return res.status(500).json({
			error: "Failed to retrieve blogs",
		});
	}
});

module.exports = router;
