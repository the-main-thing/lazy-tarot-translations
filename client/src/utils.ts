import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { WsFromServer, WsToServer } from './types'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export const getAPIEndpointURL = (endpoint: string) => {
	return new URL(endpoint, `https://${__API_ORIGIN__}`).toString()
}

export const getWsEndpointURL = (endpoint: string) => {
	return new URL(endpoint, `wss://${__API_ORIGIN__}`).toString()
}

export const sendWs = (ws: WebSocket, message: WsToServer) => {
	ws.send(JSON.stringify(message))
	return
}

export const listenWs = (
	ws: WebSocket,
	onMessage: (message: WsFromServer) => void
) => {
	const onWsMessage = (event: any) => {
		try {
			const message = JSON.parse(event.data)
			onMessage(message)
		} catch {
			console.error('Failed to parse WS message:', event)
		}
	}
	ws.addEventListener('message', onWsMessage)

	return () => {
		ws.removeEventListener('message', onWsMessage)
	}
}
