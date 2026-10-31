const argon2 = require("argon2");

const options = {
	type: argon2.argon2id,
	memoryCost: 65536,
	timeCost: 3,
	parallelism: 4,
};

function hashPassword(password) {
	return argon2.hash(password, options);
}

function verifyPassword(hash, password) {
	return argon2.verify(hash, password);
}

module.exports = {
	hashPassword,
	verifyPassword,
};
