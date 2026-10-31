const express = require("express");
const productController = require("../controllers/products");
const variantController = require("../controllers/variant.controller");

const router = express.Router();

router.post("/:productId/variants", variantController.createVariant);
router.get("/:productId/variants", variantController.getVariants);
router.get("/:productId/variants/:variantId", variantController.getVariantById);
router.patch("/:productId/variants/:variantId", variantController.updateVariant);
router.delete(
	"/:productId/variants/:variantId",
	variantController.deactivateVariant
);

router.get("/", productController.listProducts);
router.get("/:productId", productController.getProduct);
router.patch("/:productId", productController.updateProductDetails);
router.delete("/:productId", productController.archiveProduct);
router.post("/", productController.createProduct);

module.exports = router;