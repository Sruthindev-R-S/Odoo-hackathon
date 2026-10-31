const express = require("express");
const productController = require("../controllers/products");
const variantController = require("../controllers/variant.controller");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

router.post("/:productId/variants", requireAdmin, variantController.createVariant);
router.get("/:productId/variants", variantController.getVariants);
router.get("/:productId/variants/:variantId", variantController.getVariantById);
router.patch("/:productId/variants/:variantId", requireAdmin, variantController.updateVariant);
router.delete(
	"/:productId/variants/:variantId",
	requireAdmin,
	variantController.deactivateVariant
);

router.get("/", productController.listProducts);
router.get("/:productId", productController.getProduct);
router.patch("/:productId", requireAdmin, productController.updateProductDetails);
router.delete("/:productId", requireAdmin, productController.archiveProduct);
router.post("/", requireAdmin, productController.createProduct);

module.exports = router;