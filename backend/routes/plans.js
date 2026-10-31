const express = require("express");
const controller = require("../controllers/plans");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

router.post("/", requireAdmin, controller.create);
router.get("/", controller.list);
router.get("/:planId", controller.getOne);
router.patch("/:planId", requireAdmin, controller.update);
router.delete("/:planId", requireAdmin, controller.archive);
router.patch("/:planId/status", requireAdmin, controller.status);

module.exports = router;
