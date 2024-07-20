import path from 'path'

import cookie from 'cookie'
import sanitizeHTML from 'sanitize-html'
import {
	redis,
	getTranslations,
	addTranslation,
	importTranslations,
} from './redis'

import { envMap } from './env'

const clientDist = path.join(process.cwd(), '..', 'client', 'dist')

const cookieAge = 60 * 60 * 24 * 365
const TEN_MINUTES_MS = 1000 * 60 * 10
const hashedPassword = await Bun.password.hash(envMap.PASSWORD)

const sanitize = (input: unknown): string => {
	if (typeof input !== 'string') {
		throw new Error('Input must be a string')
	}
	return sanitizeHTML(input, {
		allowedTags: [],
	})
}

const sessionCookieKey =
	envMap.NODE_ENV === 'development' ? 'session' : '__Secure-Session'

const lockState = getLocksState()

const server = Bun.serve<{ wsSession: string }>({
	development: process.env.NODE_ENV === 'development',
	fetch: async (req, server): Promise<Response> => {
		const url = new URL(req.url)
		const cookieHeaderValue = req.headers.get('cookie')
		const cookies = cookie.parse(cookieHeaderValue || '')
		if (cookies[sessionCookieKey] !== hashedPassword) {
			if (req.method === 'GET' && url.pathname === '/') {
				return new Response(Bun.file(path.join('.', 'index.html')))
			}
			if (req.method === 'POST' && url.pathname === '/') {
				const formData = await req.formData()
				if (envMap.PASSWORD === formData.get('password')) {
					return new Response(
						Bun.file(path.join(clientDist, 'index.html')),
						{
							status: 200,
							headers: {
								'Set-Cookie': cookie.serialize(
									sessionCookieKey,
									hashedPassword,
									{
										maxAge: cookieAge,
										secure:
											envMap.NODE_ENV !== 'development',
										httpOnly: true,
										path: '/',
										sameSite: 'lax',
									}
								),
							},
						}
					)
				}
			}
			if (url.pathname !== '/') {
				return Response.redirect('/', 302)
			}
		}

		if (url.pathname === '/api/ws') {
			const wsSession =
				cookie.parse(req.headers.get('cookie') || '')?.['WS_SESSION'] ||
				crypto.randomUUID()
			const success = server.upgrade(req, {
				headers: {
					'Set-Cookie': cookie.serialize('WS_SESSION', wsSession, {
						httpOnly: true,
						sameSite: 'lax',
						path: '/',
						maxAge: cookieAge,
					}),
				},
				data: { wsSession },
			})
			if (success) {
				// Bun automatically returns a 101 Switching Protocols
				// if the upgrade succeeds
				return undefined as never
			}
		}
		if (url.pathname === '/api/update' && req.method === 'POST') {
			try {
				const formData = await req.formData()
				const message = sanitize(formData.get('message'))
				const lang = sanitize(formData.get('lang'))
				const key = sanitize(formData.get('key'))
				await addTranslation(redis, key, {
					lang,
					message,
				})
				server.publish(
					'BROADCAST',
					JSON.stringify({
						type: 'UPDATE',
						key,
						lang,
						message,
					})
				)
				return new Response('Translation updated', { status: 200 })
			} catch (error) {
				if (
					error &&
					typeof error === 'object' &&
					'message' in error &&
					typeof error.message === 'string' &&
					error.message
				) {
					return new Response(error.message, { status: 500 })
				}
				return new Response('Internal Server Error', { status: 500 })
			}
		}

		if (url.pathname === '/api/get' && req.method === 'GET') {
			const translations = await getTranslations(redis)
			return Response.json(translations)
		}

		if (url.pathname === '/api/import' && req.method === 'POST') {
			if (req.headers.get('x-api-key') !== envMap.IMPORT_TOKEN) {
				return new Response('Invalid API key', { status: 401 })
			}
			try {
				const extracted = await req.json()
				await importTranslations(redis, 'en', extracted)
				server.publish(
					'BROADCAST',
					JSON.stringify({
						type: 'IMPORT',
					})
				)
				return new Response('Translations imported', { status: 200 })
			} catch (error) {
				if (
					error &&
					typeof error === 'object' &&
					'message' in error &&
					typeof error.message === 'string' &&
					error.message
				) {
					return new Response(error.message, { status: 500 })
				}
				return new Response('Internal Server Error', { status: 500 })
			}
		}

		if (req.method !== 'GET') {
			return new Response('Method Not Allowed', { status: 405 })
		}

		try {
			let filePath = path.join(clientDist, url.pathname)
			if (url.pathname === '/') {
				filePath = path.join(clientDist, 'index.html')
			}
			return new Response(Bun.file(filePath))
		} catch {
			return new Response('Not Found', { status: 404 })
		}
	},
	websocket: {
		open: ws => {
			ws.subscribe('BROADCASTED')
			const locks = {} as Record<string, string>
			for (const [key, [id]] of lockState.locks.entries()) {
				locks[key] = id
			}
			ws.send(
				JSON.stringify({
					type: 'init',
					locks,
				})
			)
		},
		async message(ws, rawMessage) {
			try {
				const message = JSON.parse(rawMessage as string)
				switch (message.type) {
					case 'lock':
						if (lockState.lock(message.key, message.id)) {
							const response = JSON.stringify({
								type: 'lock',
								key: message.key,
								id: message.id,
							})
							server.publish('BROADCASTED', response)
							return
						}
						ws.send(
							JSON.stringify({
								type: 'lock-denied',
								key: message.key,
								id: message.id,
							})
						)
						return
					case 'release':
						if (lockState.release(message.key, message.id)) {
							const response = JSON.stringify({
								type: 'release',
								key: message.key,
							})
							server.publish('BROADCASTED', response)
							return
						}
						ws.send(
							JSON.stringify({
								type: 'release-denied',
								key: message.key,
								id: message.id,
							})
						)
						return
					case 'release-all':
						const released = lockState.releaseById(message.id)
						for (const key of released) {
							server.publish(
								'BROADCASTED',
								JSON.stringify({ type: 'release', key })
							)
						}
						return
					default:
						ws.send(
							JSON.stringify({
								type: 'error',
								message: 'Invalid message type',
							})
						)
						return
				}
			} catch (error) {
				if (
					error &&
					typeof error === 'object' &&
					'message' in error &&
					typeof error.message === 'string' &&
					error.message
				) {
					ws.send(
						JSON.stringify({
							type: 'error',
							message: error.message,
						})
					)
					return
				}
				ws.send(
					JSON.stringify({
						type: 'error',
						message: 'Internal Server Error',
					})
				)
			}
		},
	},
})

console.log(`Listening on http://${server.hostname}:${server.port}`)

function getLocksState() {
	const locks = new Map<string, [string, number]>()
	setInterval(() => {
		const keysToRelease = [] as Array<string>
		for (const [key, [, expiresAt]] of locks.entries()) {
			if (expiresAt <= Date.now()) {
				keysToRelease.push(key)
				server.publish(
					'BROADCASTED',
					JSON.stringify({ type: 'release', key })
				)
			}
		}
		for (const key of keysToRelease) {
			locks.delete(key)
		}
	}, TEN_MINUTES_MS)
	const lock = (key: string, id: string) => {
		const current = locks.get(key)
		if (current && current[0] === id) {
			current[1] = Date.now() + TEN_MINUTES_MS
			return true
		}
		if (!current) {
			locks.set(key, [id, Date.now() + TEN_MINUTES_MS])
			return true
		}

		if (current && current[1] <= Date.now()) {
			locks.set(key, [id, Date.now() + TEN_MINUTES_MS])
			return true
		}

		return false
	}

	const release = (key: string, id: string) => {
		const current = locks.get(key)
		if (current && current[0] === id) {
			locks.delete(key)
			return true
		}
		return !current
	}

	const releaseById = (id: string) => {
		const keysToRelease: Array<string> = []
		for (const [key, [userId]] of locks.entries()) {
			if (userId === id) {
				keysToRelease.push(key)
			}
		}
		for (const key of keysToRelease) {
			release(key, id)
		}

		return keysToRelease
	}

	return {
		locks,
		releaseById,
		lock,
		release,
	}
}
