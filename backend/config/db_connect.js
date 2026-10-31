const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const pool = new Pool({
	host: process.env.DB_HOST || "localhost",
	port: Number(process.env.DB_PORT) || 5432,
	database: process.env.DB_NAME || "postgres",
	user: process.env.DB_USER || "postgres",
	password: process.env.DB_PASSWORD,
});

pool.on("error", (error) => {
	console.error("Unexpected PostgreSQL pool error:", error);
});

module.exports = pool;
