export const withError = async <TResult extends Promise<any>>(
	callback: () => TResult
): Promise<
	[null, Error | Record<PropertyKey, unknown>] | [Awaited<TResult>, null]
> => {
	try {
		const result = await callback()
		return [result, null]
	} catch (error) {
		if (!error) {
			return [null, new Error('An unexpected error occurred')]
		}
		return [null, error as never]
	}
}
