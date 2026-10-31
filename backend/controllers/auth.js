const crypto = require("crypto");
const transporter = require("../config/mailer");
const pool = require("../config/db_connect");

async function forgotPassword(req, res) {
	try {
		const { email } = req.body;

		const result = await pool.query(
			"SELECT id FROM users WHERE email = $1",
			[email]
		);

		const response = {
			message: "If the account exists, a reset link will be sent.",
		};

		if (result.rows.length === 0) {
			return res.json(response);
		}

		const userId = result.rows[0].id;
		const token = crypto.randomBytes(32).toString("hex");
		const tokenHash = crypto
			.createHash("sha256")
			.update(token)
			.digest("hex");

		await pool.query(
			`UPDATE password_reset_tokens
			 SET used_at = NOW()
			 WHERE user_id = $1 AND used_at IS NULL`,
			[userId]
		);

		await pool.query(
			`INSERT INTO password_reset_tokens
			 (user_id, token_hash, expires_at)
			 VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
			[userId, tokenHash]
		);

		const resetLink =
			`${process.env.FRONTEND_URL}/reset-password?token=${token}`;

		await transporter.sendMail({
			from: process.env.SMTP_USER,
			to: email,
			subject: "Password Reset Request",
			html: `
				<h2>Password Reset</h2>
				<p>Click the link below to reset your password.</p>
				<a href="${resetLink}">Reset Password</a>
				<p>This link expires in 15 minutes.</p>
				<p>If you didn't request this, ignore this email.</p>
			`,
		});

		return res.json(response);
	} catch (error) {
		console.error("Failed to send password reset email:", error);
		return res.status(500).json({
			message: "Something went wrong.",
		});
	}
}

module.exports = {
	forgotPassword,
};
