const {
	createProduct: insertProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
} = require("../models/products");

async function createProduct(req, res) {
	const { name, type, salesPrice, costPrice, notes } = req.body;

	if (!name || !type || salesPrice === undefined || costPrice === undefined) {
		return res.status(400).json({
			error: "Name, type, sales price, and cost price are required",
		});
	}

	if (!Number.isFinite(Number(salesPrice)) || !Number.isFinite(Number(costPrice))) {
		return res.status(400).json({
			error: "Sales price and cost price must be valid numbers",
		});
	}

	try {
		const product = await insertProduct(
			name.trim(),
			type.trim(),
			Number(salesPrice),
			Number(costPrice),
			notes ? notes.trim() : null
		);

		return res.status(201).json({
			message: "Product created successfully",
			product,
		});
	} catch (error) {
		console.error("Failed to create product:", error);
		return res.status(500).json({
			error: "Failed to create product",
		});
	}
}

async function listProducts(req, res) {
	try {
		return res.json(await getProducts());
	} catch (error) {
		console.error("Failed to retrieve products:", error);
		return res.status(500).json({ error: "Failed to retrieve products" });
	}
}

async function getProduct(req, res) {
	try {
		const product = await getProductById(req.params.productId);

		if (!product) {
			return res.status(404).json({ error: "Product not found" });
		}

		return res.json(product);
	} catch (error) {
		console.error("Failed to retrieve product:", error);
		return res.status(500).json({ error: "Failed to retrieve product" });
	}
}

async function updateProductDetails(req, res) {
	const { name, type, salesPrice, costPrice, notes } = req.body;

	if (
		salesPrice !== undefined &&
		!Number.isFinite(Number(salesPrice))
	) {
		return res.status(400).json({ error: "Sales price must be a valid number" });
	}

	if (
		costPrice !== undefined &&
		!Number.isFinite(Number(costPrice))
	) {
		return res.status(400).json({ error: "Cost price must be a valid number" });
	}

	try {
		const product = await updateProduct(req.params.productId, {
			name: name === undefined ? undefined : name.trim(),
			type: type === undefined ? undefined : type.trim(),
			sales_price: salesPrice === undefined ? undefined : Number(salesPrice),
			cost_price: costPrice === undefined ? undefined : Number(costPrice),
			notes: notes === undefined ? undefined : notes,
		});

		if (!product) {
			return res.status(404).json({ error: "Product not found" });
		}

		return res.json({ message: "Product updated successfully", product });
	} catch (error) {
		console.error("Failed to update product:", error);
		return res.status(500).json({ error: "Failed to update product" });
	}
}

async function archiveProduct(req, res) {
	try {
		const product = await deleteProduct(req.params.productId);

		if (!product) {
			return res.status(404).json({ error: "Product not found" });
		}

		return res.json({ message: "Product archived successfully", product });
	} catch (error) {
		console.error("Failed to archive product:", error);
		return res.status(500).json({ error: "Failed to archive product" });
	}
}

module.exports = {
	createProduct,
	listProducts,
	getProduct,
	updateProductDetails,
	archiveProduct,
};