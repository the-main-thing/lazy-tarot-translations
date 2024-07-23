import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import type { Translations, TranslationRecord } from './types'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { TranslationItem } from './components/TranslationItem'
import { listenWs, sendWs } from './utils'
import { Label } from './components/ui/label'
import { Switch } from './components/ui/switch'

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
	const [ws, setWs] = useState<null | WebSocket>(null)
	const [lockedKeys, setLockedKeys] = useState<{
		[key: string]: string
	}>({})

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
					id,
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
				case 'init':
					setLockedKeys(message.locks)
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
			console.log('Locking', key, id)
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

	const [filterTranslated, setFilterTranslated] = useState(false)
	const filteredTranslations = useMemo(() => {
		if (!filterTranslated || !translations) {
			return translations
		}
		return translations.filter(([_, { translations: records }]) => {
			return records.some(({ message }) => !message)
		})
	}, [filterTranslated, translations])

	const content = error ? (
		<>
			<h1>Ошибка при загрузке переводов. Скажи Павлушке об этом</h1>
		</>
	) : (
		<div className="w-2/3">
			{!filteredTranslations ? (
				<p>Загрузка переводов...</p>
			) : (
				<div className="flex flex-col gap-8">
					<Label>
						<div className="mb-2">Скрыть переведённые</div>
						<Switch
							checked={filterTranslated}
							onCheckedChange={() =>
								setFilterTranslated(current => !current)
							}
						/>
					</Label>
					{filteredTranslations.map(
						([key, { description, translations: messages }]) => {
							const locked =
								!!lockedKeys[key] && lockedKeys[key] !== id
							return (
								<Card
									key={key}
									className={
										locked
											? 'outline outline-2 outline-offset-2 outline-cyan-500'
											: ''
									}
								>
									<CardHeader>
										<CardTitle>{description}</CardTitle>
									</CardHeader>
									<CardContent>
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
															disabled={locked}
															ws={ws}
														/>
													</li>
												)
											})}
										</ul>
									</CardContent>
								</Card>
							)
						}
					)}
				</div>
			)}
		</div>
	)

	return (
		<div className="flex w-screen h-screen justify-center p-16">
			{content}
		</div>
	)
}

export default App
