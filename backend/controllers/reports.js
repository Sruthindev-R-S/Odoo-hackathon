const reports = require("../services/reports");

async function run(res, operation) {
	try { return res.json(await operation()); }
	catch (error) {
		console.error("Failed to generate report:", error);
		return res.status(500).json({ error: "Failed to generate report" });
	}
}

module.exports = {
	dashboard: (req, res) => run(res, () => reports.dashboard(req.query)),
	activeSubscriptions: (req, res) => run(res, () => reports.activeSubscriptions(req.query)),
	revenue: (req, res) => run(res, () => reports.revenue(req.query)),
	payments: (req, res) => run(res, () => reports.payments(req.query)),
	outstanding: (req, res) => run(res, () => reports.outstanding(req.query)),
	overdue: (req, res) => run(res, () => reports.outstanding(req.query, true)),
};
