const express = require("express");
const controller = require("../controllers/commercial");
const { requireCompanyUser } = require("../middleware/company_user");

const router = express.Router();
router.use(requireCompanyUser);

router.post("/quotation-templates", controller.createTemplate);
router.get("/quotation-templates", controller.listTemplates);
router.get("/quotation-templates/:templateId", controller.getTemplateRoute);
router.patch("/quotation-templates/:templateId", controller.updateTemplate);
router.delete("/quotation-templates/:templateId", controller.archiveTemplate);
router.post("/quotation-templates/:templateId/items", controller.addTemplateItem);
router.patch("/quotation-templates/:templateId/items/:itemId", controller.updateTemplateItem);
router.delete("/quotation-templates/:templateId/items/:itemId", controller.deleteTemplateItem);

router.post("/quotations", controller.createQuotation);
router.post("/quotations/from-template/:templateId", (req, res) =>
	controller.createQuotation(req, res, req.params.templateId));
router.get("/quotations", controller.listQuotations);
router.get("/quotations/:quotationId", controller.getQuotationRoute);
router.patch("/quotations/:quotationId", controller.updateQuotation);
router.post("/quotations/:quotationId/send", controller.sendQuotation);
router.post("/quotations/:quotationId/confirm", controller.confirmQuotation);

router.post("/subscriptions", controller.createSubscription);
router.get("/subscriptions", controller.listSubscriptions);
router.get("/subscriptions/:subscriptionId", controller.getSubscriptionRoute);
router.patch("/subscriptions/:subscriptionId", controller.updateSubscription);
router.post("/subscriptions/:subscriptionId/quote", (req, res) =>
	controller.transitionSubscription(req, res, "quotation"));
router.post("/subscriptions/:subscriptionId/confirm", (req, res) =>
	controller.transitionSubscription(req, res, "confirmed"));
router.post("/subscriptions/:subscriptionId/activate", (req, res) =>
	controller.transitionSubscription(req, res, "active"));
router.post("/subscriptions/:subscriptionId/close", (req, res) =>
	controller.transitionSubscription(req, res, "closed"));
router.get("/subscriptions/:subscriptionId/items", controller.listSubscriptionItems);
router.post("/subscriptions/:subscriptionId/items", controller.addSubscriptionItem);
router.patch("/subscriptions/:subscriptionId/items/:itemId", controller.updateSubscriptionItem);
router.delete("/subscriptions/:subscriptionId/items/:itemId", controller.deleteSubscriptionItem);
router.get("/subscriptions/:subscriptionId/history", controller.history);

module.exports = router;
