import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import type { Translations, TranslationRecord } from './types'
import { TranslationItem } from './components/TranslationItem'
import { listenWs, sendWs } from './utils'

const id = crypto.randomUUID()

function App() {
	const { data: translations, error } = useQuery({
		queryKey: ['translations'],
		queryFn: async () => {
			const response = await fetch('/api/get')
			const translations =
				(await response.json()) as Promise<Translations>
			return Object.entries(translations) as Array<
				[string, TranslationRecord]
			>
		},
	})
	const queryClient = useQueryClient()
	const { mutate, isPending } = useMutation({
		mutationFn: async (formData: FormData) => {
			const response = await fetch('/api/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			})
			if (response.status >= 400) {
				const message = await response.text()
				throw new Error(message)
			}

			return null
		},
		onSettled: async () => {
			queryClient.invalidateQueries({ queryKey: ['translations'] })
		},
	})
	const [ws, setWs] = useState<null | WebSocket>(null)
	const [lockedKeys, setLockedKeys] = useState<{
		[key: string]: string
	}>({})

	const [updates, setUpdates] = useState<null | {
		[key: string]: {
			lang: string
			message: string
		}
	}>(null)

	useEffect(() => {
		setUpdates(null)
	}, [translations])

	useEffect(() => {
		if (!ws) {
			return
		}
		const keepAlive = Object.entries(lockedKeys).filter(([, userId]) => {
			return id === userId
		})
		const interval = setInterval(() => {
			for (const [key] of keepAlive) {
				sendWs(ws, {
					type: 'lock',
					key,
					id
				})
			}
		}, 1000 * 60 * 3)

		return () => clearInterval(interval)
	}, [lockedKeys, ws])

	useEffect(() => {
		const ws = new WebSocket('ws://localhost:3000/api/ws')
		setWs(ws)

		const stopListening = listenWs(ws, message => {
			switch (message.type) {
				case 'lock':
					setLockedKeys(current => ({
						...current,
						[message.key]: message.id,
					}))
					return
				case 'release':
					setLockedKeys(current => {
						const { [message.key]: _, ...rest } = current
						return rest
					})
					return
				case 'lock-denied':
					setLockedKeys(current => {
						if (current[message.key] === message.id) {
							const { [message.key]: _, ...rest } = current
							return rest
						}
						return current
					})
					return
				case 'UPDATE':
				case 'IMPORT':
					queryClient.invalidateQueries({
						queryKey: ['translations'],
					})
					return
				case 'error':
					console.error('Server error', message.message)
					return
				default:
					return
			}
		})

		const beforeUnload = () => {
			sendWs(ws, { type: 'release-all', id })
			ws.close()
		}
		window.addEventListener('beforeunload', beforeUnload)

		return () => {
			stopListening()
			window.removeEventListener('beforeunload', beforeUnload)
			ws.close()
		}
	}, [queryClient])

	const lock = useCallback(
		({ key, id }: { key: string; id: string }) => {
			if (!ws) {
				return
			}
			setLockedKeys(current => {
				if (current[key] && current[key] !== id) {
					return current
				}
				return {
					...current,
					[key]: id,
				}
			})
			sendWs(ws, {
				type: 'lock',
				key,
				id,
			})
		},
		[ws]
	)

	const release = useCallback(
		({ key, id }: { key: string; id: string }) => {
			if (!ws) {
				return
			}
			setLockedKeys(current => {
				if (current[key] && current[key] !== id) {
					return current
				}
				const { [key]: _, ...rest } = current
				return rest
			})
			sendWs(ws, {
				type: 'release',
				key,
				id,
			})
		},
		[ws]
	)

	const content = error ? (
		<>
			<h1>Ошибка при загрузке переводов. Скажи Павлушке об этом</h1>
		</>
	) : (
		<div>
			<ul>
				{!translations ? (
					<p>Загрузка переводов...</p>
				) : (
					translations.map(
						([key, { description, translations: messages }]) => {
							return (
								<li key={key}>
									<div>
										<p>{description}</p>
									</div>
									<div>
										<ul>
											{messages.map(record => {
												return (
													<li>
														<TranslationItem
															translationKey={key}
															id={id}
															lang={record.lang}
															message={
																record.message
															}
															onLock={lock}
															onRelease={release}
															disabled={
																lockedKeys[
																	key
																] === id
															}
															ws={ws}
														/>
													</li>
												)
											})}
										</ul>
									</div>
								</li>
							)
						}
					)
				)}
			</ul>
		</div>
	)

	return (
		<div className="App">
			<h1>Vite + React</h1>
			{content}
		</div>
	)
}

export default App