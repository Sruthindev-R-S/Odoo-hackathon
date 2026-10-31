const express = require("express");
const controller = require("../controllers/invoices");
const { requireCompanyUser } = require("../middleware/company_user");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
router.use(requireCompanyUser);

router.get("/invoices", controller.list);
router.get("/invoices/:invoiceId", controller.getOne);
router.get("/invoices/:invoiceId/items", controller.items);
router.post("/invoices/generate", controller.generate);
router.post("/invoices/:invoiceId/confirm", controller.confirm);
router.post("/invoices/:invoiceId/cancel", controller.cancel);
router.post("/invoices/:invoiceId/send", controller.send);
router.get("/invoices/:invoiceId/print", controller.print);
router.post("/invoices/:invoiceId/payments", controller.addPayment);
router.get("/invoices/:invoiceId/payments", controller.payments);
router.get("/payments/:paymentId", controller.payment);
router.patch("/payments/:paymentId", controller.updatePaymentDetails);
router.get("/payments", controller.allPayments);
router.get("/taxes", controller.listTaxes);
router.post("/taxes", requireAdmin, controller.createTax);
router.patch("/taxes/:taxId", requireAdmin, controller.updateTax);

module.exports = router;
