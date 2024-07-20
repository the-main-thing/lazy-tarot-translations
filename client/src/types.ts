export interface Translation {
	lang: string
	message: string
}

export interface Translations {
	[key: string]: TranslationRecord
}

export interface TranslationRecord {
	description: string
	translations: Array<Translation>
}

export type WsToServer =
	| {
			type: 'lock'
			key: string
			id: string
	  }
	| {
			type: 'release'
			key: string
			id: string
	  }
	| {
			type: 'release-all'
			id: string
	  }

export type WsFromServer =
	| {
			type: 'lock'
			key: string
			id: string
	  }
	| {
			type: 'release'
			key: string
	  }
	| {
			type: 'lock-denied'
			key: string
			id: string
	  }
	| {
			type: 'release-denied'
			key: string
			id: string
	  }
	| {
			type: 'error'
			message: string
	  }
	| {
			type: 'UPDATE'
			key: string
			lang: string
			message: string
	  }
	| {
			type: 'IMPORT'
	  }
