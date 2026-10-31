const express = require("express");
const controller = require("../controllers/reports");
const { requireCompanyUser } = require("../middleware/company_user");

const router = express.Router();
router.use(requireCompanyUser);
router.get("/reports/dashboard", controller.dashboard);
router.get("/reports/active-subscriptions", controller.activeSubscriptions);
router.get("/reports/revenue", controller.revenue);
router.get("/reports/payments", controller.payments);
router.get("/reports/outstanding-invoices", controller.outstanding);
router.get("/reports/overdue-invoices", controller.overdue);

module.exports = router;
