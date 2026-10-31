const express = require("express");
const controller = require("../controllers/discounts");
const { requireCompanyUser } = require("../middleware/company_user");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
router.use(requireCompanyUser);
router.get("/discounts", controller.list);
router.get("/discounts/available", controller.available);
router.get("/discounts/:discountId", controller.getOne);
router.get("/discounts/:discountId/usage", controller.usage);
router.post("/discounts", requireAdmin, controller.create);
router.patch("/discounts/:discountId", requireAdmin, controller.update);
router.delete("/discounts/:discountId", requireAdmin, controller.archive);
router.patch("/discounts/:discountId/status", requireAdmin, controller.status);

module.exports = router;
