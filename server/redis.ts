import Redis from 'ioredis'

import { envMap } from './env'

const LANGUAGES = ['en', 'ru']

export const redis = new Redis(envMap.REDIS_CONNECTION_STRING)
export type RedisClient = typeof redis

export interface Extracted {
	[key: string]: {
		defaultMessage: string
		description?: string
	}
}

const TRANSLATIONS_KEY = 'translations'
export interface Translation {
	lang: string
	message: string
}

export interface Translations {
	[key: string]: TranslationRecord
}

class TranslationRecord {
	description: string
	translations: Array<Translation>

	constructor(existingTranslationString: string | undefined | null) {
		if (existingTranslationString) {
			try {
				const { description, translations } = JSON.parse(
					existingTranslationString
				)
				this.description = description
				this.translations = translations
			} catch {
				// ignore
			}
		}

		this.description = ''
		this.translations = LANGUAGES.map(lang => ({ lang, message: '' }))
	}
}

const findAndReplaceOrPush = <T>(
	array: Array<T>,
	predicate: (item: T) => boolean,
	replacement: (current: T | undefined) => T
) => {
	for (let i = 0; i < array.length; i++) {
		if (predicate(array[i]!)) {
			array[i] = replacement(array[i])
			return array
		}
	}
	array.push(replacement(undefined))
	return array
}

const getTranslationsCache = () => {
	let translations: Translations | null = null
	const getTranslations = async (redis: RedisClient) => {
		if (!translations) {
			const translationsString = await redis.get(TRANSLATIONS_KEY)
			if (!translationsString) {
				translations = {}
				return translations
			}
			translations = JSON.parse(translationsString) as Translations
		}

		return translations
	}

	const addTranslation = async (
		redis: RedisClient,
		key: string,
		translation: Translation
	) => {
		const translations = await getTranslations(redis)
		if (!translations[key]) {
			throw new Error(`Key "${key}" not found`)
		}
		findAndReplaceOrPush(
			translations[key].translations,
			({ lang }) => translation.lang === lang,
			() => translation
		)
		await redis.set(TRANSLATIONS_KEY, JSON.stringify(translations))
	}

	const importTranslations = async (
		redis: RedisClient,
		lang: string,
		extracted: Extracted
	) => {
		const translations = await getTranslations(redis)
		for (const [key, { defaultMessage, description }] of Object.entries(
			extracted
		)) {
			const translation = translations[key] || new TranslationRecord(null)
			translation.description = description || ''
			findAndReplaceOrPush(
				translation.translations,
				translation => translation.lang === lang,
				current => {
					if (current) {
						current.message = defaultMessage
						return current
					}
					return {
						lang,
						message: defaultMessage,
					}
				}
			)
			translations[key] = translation
		}
		for (const key of Object.keys(translations)) {
			if (key in extracted) {
				continue
			}
			translations[key] = undefined as never
		}
		await redis.set(TRANSLATIONS_KEY, JSON.stringify(translations))
	}

	return {
		getTranslations,
		addTranslation,
		importTranslations,
	}
}

export const { getTranslations, addTranslation, importTranslations } =
	getTranslationsCache()
