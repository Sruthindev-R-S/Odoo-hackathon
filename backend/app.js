require('dotenv').config();

const express = require('express');
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

const cors = require('cors');
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);
app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedOrigins.includes(origin)) {
				return callback(null, true);
			}
			return callback(new Error('Origin is not allowed by CORS'));
		},
	})
);

app.get('/health', (_req, res) => {
	res.json({ status: 'ok' });
});

require("./config/db_connect");

const { createPasswordResetTokensTable } = require("./models/reset");
const { createProductTables } = require("./models/products");
const { createPlanTables } = require("./models/plans");
const { createCommercialTables } = require("./models/commercial");
const { startBillingScheduler } = require("./jobs/billing");

app.use("/user", require("./routes/user_routes"));
app.use("/company-users", require("./routes/company_users"));
app.use("/products", require("./routes/products"));
app.use("/api/plans", require("./routes/plans"));
app.use("/api", require("./routes/commercial"));
app.use("/api", require("./routes/invoices"));
app.use("/api", require("./routes/discounts"));
app.use("/api", require("./routes/reports"));


Promise.all([
  createPasswordResetTokensTable(),
  createProductTables(),
])
  .then(() => createPlanTables())
  .then(() => createCommercialTables())
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      startBillingScheduler();
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database schema:", error);
    process.exit(1);
  });
