import { useState, useMemo, memo, useEffect } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useOptimistic } from '@/hooks/useOptimistic'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { Button } from '../ui/button'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '../ui/accordion'
import { listenWs } from '@/utils'

interface Props {
	lang: string
	message: string
	translationKey: string
	disabled: boolean
	id: string
	ws: WebSocket | null
	onLock: (props: { key: string; id: string }) => void
	onRelease: (props: { key: string; id: string }) => void
}

const useTranslation = (props: Props) => {
	const [message, setMessage] = useOptimistic(props.message)

	const queryClient = useQueryClient()
	const { mutate, isPending } = useMutation({
		mutationFn: async (input: {
			disabled: boolean
			formData: FormData
		}) => {
			if (input.disabled) {
				throw new Error(
					'This mutation sould not be called when the key is locked.'
				)
			}
			const response = await fetch('/api/update', {
				method: 'POST',
				body: input.formData,
			})
			if (response.status >= 400) {
				throw new Error(
					(await response.text()) || 'Error updating translation'
				)
			}
			return input
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['translations'] })
		},
	})
	useEffect(() => {
		if (!props.ws) {
			return
		}
		return listenWs(props.ws, message => {
			if (message.type === 'UPDATE') {
				if (
					message.key === props.translationKey &&
					message.lang === props.lang
				) {
					setMessage(message.message)
				}
			}
		})
	}, [props.ws, props.id, props.translationKey, props.lang])

	const [collapsed, setCollapsed] = useState(!!message.trim())

	return useMemo(
		() => ({
			message,
			setMessage,
			collapsed,
			setCollapsed,
			isPending,
			mutate,
		}),
		[message, setMessage, collapsed, setCollapsed, isPending, mutate]
	)
}

export const TranslationItem = memo((props: Props) => {
	const { message, setMessage, collapsed, setCollapsed, isPending, mutate } =
		useTranslation(props)

	return (
		<Accordion
			value={collapsed ? '' : 'opened'}
			onValueChange={() => {
				setCollapsed(current => !current)
			}}
			type="single"
			collapsible
			className="w-full"
		>
			<AccordionItem value="opened">
				<AccordionTrigger>{props.lang}</AccordionTrigger>
				<AccordionContent className="p-2">
					<form
						className="flex flex-col gap-2"
						onSubmit={event => {
							event.preventDefault()
							if (props.disabled || isPending) {
								return
							}
							const formData = new FormData(event.currentTarget)
							mutate({
								disabled: props.disabled,
								formData,
							})
						}}
						onFocus={() => {
							props.onLock({
								key: props.translationKey,
								id: props.id,
							})
						}}
						onBlur={() => {
							props.onRelease({
								key: props.translationKey,
								id: props.id,
							})
						}}
					>
						<input
							type="hidden"
							name="key"
							value={props.translationKey}
						/>
						<input type="hidden" name="lang" value={props.lang} />
						<HoverCard>
							<HoverCardTrigger asChild>
								<div>
									<Label
										htmlFor={`${props.translationKey}-${props.lang}`}
									>
										<div className="pb-2">Перевод для </div>
									</Label>

									<Textarea
										id={`${props.translationKey}-${props.lang}`}
										disabled={props.disabled}
										name="message"
										placeholder="Введи перевод"
										value={message}
										onChange={event => {
											if (props.disabled || isPending) {
												return
											}
											setMessage(event.target.value)
										}}
									/>
								</div>
							</HoverCardTrigger>
							<HoverCardContent className="w-80">
								<p className="text-pretty text-justify">
									Текст внутри скобок: "{`{{ value }}`}"
									&mdash; это плейсхолдер для переменной. Его
									нельзя менять и надо копировать вместе со
									скобками.
								</p>
								<p className="text-pretty text-justify">
									Символы вроде "\n" или "{'&nbsp;'}" &mdash;
									это знаки препинания, либо переносы строк,
									либо пробелы. Их следует оставлять, если
									есть смысл.
								</p>
							</HoverCardContent>
						</HoverCard>
						<Button
							type="submit"
							disabled={props.disabled || isPending}
						>
							Сохранить
						</Button>
					</form>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
})
