const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

const cors = require('cors');
app.use(cors());

require("./config/db_connect");

const { createPasswordResetTokensTable } = require("./models/reset");

app.use("/user", require("./routes/user_routes"));
app.use("/company-users", require("./routes/company_users"));

createPasswordResetTokensTable()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database schema:", error);
    process.exit(1);
  });
