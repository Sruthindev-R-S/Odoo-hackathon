const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

const cors = require('cors');
app.use(cors());

require("./config/db_connect");

app.use("/", require("./routes/routes"));

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
