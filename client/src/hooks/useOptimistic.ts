import { useState } from 'react'

export const useOptimistic = <T>(value: T) => {
	const [[prev, optimistic], setPrev] = useState([value, value] as const)
	const [setOptimistic] = useState(() => {
		return (update: T | ((prev: T) => T)) => {
			setPrev(current => {
				const next =
					typeof update === 'function'
						? (update as any)(current[1])
						: (update as T)
				if (next !== current[1]) {
					return [current[0], next]
				}
				return current
			})
		}
	})
	if (prev !== value) {
		setPrev([value, value])
		return [value, setOptimistic] as const
	}

	return [optimistic, setOptimistic] as const
}
