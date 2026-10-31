const {
	createProductVariant,
	getProductVariants,
	getProductVariantById,
	updateProductVariant,
	deleteProductVariant,
} = require("../models/products");

async function createVariant(req, res) {
	const { variantType, variantName, additionalPrice } = req.body;

	if (!variantType || !variantName) {
		return res.status(400).json({
			error: "Variant type and variant name are required",
		});
	}

	if (
		additionalPrice !== undefined &&
		!Number.isFinite(Number(additionalPrice))
	) {
		return res.status(400).json({
			error: "Additional price must be a valid number",
		});
	}

	try {
		const variant = await createProductVariant(
			req.params.productId,
			variantType.trim(),
			variantName.trim(),
			additionalPrice === undefined ? 0 : Number(additionalPrice)
		);
		return res.status(201).json({ message: "Variant created successfully", variant });
	} catch (error) {
		console.error("Failed to create variant:", error);
		return res.status(500).json({ error: "Failed to create variant" });
	}
}

async function getVariants(req, res) {
	try {
		return res.json(await getProductVariants(req.params.productId));
	} catch (error) {
		console.error("Failed to retrieve variants:", error);
		return res.status(500).json({ error: "Failed to retrieve variants" });
	}
}

async function getVariantById(req, res) {
	try {
		const variant = await getProductVariantById(
			req.params.productId,
			req.params.variantId
		);
		if (!variant) return res.status(404).json({ error: "Variant not found" });
		return res.json(variant);
	} catch (error) {
		console.error("Failed to retrieve variant:", error);
		return res.status(500).json({ error: "Failed to retrieve variant" });
	}
}

async function updateVariant(req, res) {
	const { variantType, variantName, additionalPrice } = req.body;

	if (
		additionalPrice !== undefined &&
		!Number.isFinite(Number(additionalPrice))
	) {
		return res.status(400).json({ error: "Additional price must be a valid number" });
	}

	try {
		const variant = await updateProductVariant(
			req.params.productId,
			req.params.variantId,
			{
				variant_type: variantType === undefined ? undefined : variantType.trim(),
				variant_name: variantName === undefined ? undefined : variantName.trim(),
				additional_price:
					additionalPrice === undefined ? undefined : Number(additionalPrice),
			}
		);
		if (!variant) return res.status(404).json({ error: "Variant not found" });
		return res.json({ message: "Variant updated successfully", variant });
	} catch (error) {
		console.error("Failed to update variant:", error);
		return res.status(500).json({ error: "Failed to update variant" });
	}
}

async function deactivateVariant(req, res) {
	try {
		const variant = await deleteProductVariant(
			req.params.productId,
			req.params.variantId
		);
		if (!variant) {
			return res.status(404).json({ error: "Variant not found" });
		}
		return res.json({ message: "Variant deactivated successfully", variant });
	} catch (error) {
		console.error("Failed to deactivate variant:", error);
		return res.status(500).json({ error: "Failed to deactivate variant" });
	}
}

module.exports = {
	createVariant,
	getVariants,
	getVariantById,
	updateVariant,
	deactivateVariant,
};