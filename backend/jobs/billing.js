const cron = require("node-cron");
const { generateDueInvoices } = require("../services/billing");

function startBillingScheduler() {
	return cron.schedule("*/15 * * * *", async () => {
		try {
			await generateDueInvoices();
		} catch (error) {
			console.error("Recurring billing scheduler failed:", error);
		}
	});
}

module.exports = { startBillingScheduler };
