const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

const cors = require('cors');
app.use(cors());

require("./config/db_connect");

const { createPasswordResetTokensTable } = require("./models/reset");

app.use("/", require("./routes/routes"));

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
