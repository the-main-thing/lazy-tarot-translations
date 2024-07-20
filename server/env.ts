export const envMap = {
	DOMAIN: process.env.DOMAIN!,
	PASSWORD: process.env.PASSWORD!,
	REDIS_CONNECTION_STRING: process.env.REDIS_CONNECTION_STRING!,
	IMPORT_TOKEN: process.env.IMPORT_TOKEN!,
	NODE_ENV:
		process.env.NODE_ENV === 'development' ? 'development' : 'production',
}

for (const [key, value] of Object.entries(envMap)) {
	if (!value) {
		throw new Error(`Missing environment variable: ${key}`)
	}
}
