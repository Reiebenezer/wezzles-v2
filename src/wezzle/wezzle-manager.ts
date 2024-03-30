/// <reference path="./.d.ts" />

import dragula from 'dragula'
import Wezzle, { WezzleInstance } from './wezzle'
import autoScroll from 'dom-autoscroller'
import { WezzleGroup } from './types'
import * as global from '../global'
import { templates } from './templates'
import Split from 'split.js'

import anime from 'animejs'

export default class WezzleManager {
	static instance: WezzleManager

	drake?: dragula.Drake
	group_container = document.getElementById('wz-groups')!
	template_container = document.getElementById('wz-templates')!
	instance_container = document.getElementById('wz-playground')!
	preview_container = document.getElementById(
		'wz-preview'
	)! as HTMLIFrameElement
	property_container = document.getElementById('wz-properties')!

	#splitInstance?: Split.Instance

	constructor() {
		if (WezzleManager.instance) {
			console.error('You cannot create another instance!')
			return WezzleManager.instance
		}

		WezzleManager.instance = this
	}

	init() {
		// Set up panels
		this.#panelSetup()

		// Add resizeObserver
		if (visualViewport) visualViewport.onresize = () => this.#panelSetup()

		// Initialize Wezzles by group
		const groups = Object.keys(WezzleGroup).filter(g => isNaN(Number(g)))

		const sortedTemplates = templates.sort((a, b) => {
			if (a.group < b.group) return -1
			if (a.group > b.group) return 1
			return 0
		})

		sortedTemplates.forEach(data => {
			const wz = new Wezzle(data).addTo(this.template_container)
			wz.element.onclick = () => {
				const cloned = wz.element.cloneNode(true) as HTMLElement
				this.instance_container.appendChild(cloned)

				this.#addInstance(cloned, this.drake)
			}
		})

		// Add group buttons and scrolling
		this.group_container.prepend(
			...groups.map(
				groupName =>
					new global.util.ExtendedElement('button')
						.html(groupName)
						.onclick(() => {
							const groupIndex = new Map(
								Object.entries(WezzleGroup)
							).get(groupName)

							;[...Wezzle.instances.values()]
								.find(item => item.data.group === groupIndex)
								?.element.scrollIntoView({
									inline: 'start',
									behavior: global.util.prefersReducedMotion
										? 'instant'
										: 'smooth',
								})
						}).element
			)
		)

		// Remove selected state on property panel on click outside
		this.instance_container.onclick = e => {
			if (e.target !== this.instance_container) return
			if (!this.property_container.classList.contains('active')) return

			this.property_container.classList.remove('active')
			this.instance_container
				.querySelector('.selected')
				?.classList.remove('selected')
		}

		this.#dragAPI()
		this.#autoScroll()

		const mutObserver = new MutationObserver(mutations => {
			this.parse()

			// Property selection
			const selectedElement = mutations
				.map(mut => mut.target)
				.filter(el =>
					(el as HTMLElement).classList.contains('selected')
				)[0]

			const isActive =
				this.property_container.classList.contains('active')

			this.property_container.classList.toggle(
				'active',
				this.instance_container.querySelector(
					':is(.wz, .wz-extendable).selected'
				) !== null
			)

			if (!selectedElement) return

			const selectedWezzle = WezzleInstance.getInstance(
				selectedElement as HTMLElement
			)
			this.#handleProps(selectedWezzle)

			if (global.util.prefersReducedMotion) {
				;(selectedElement as HTMLElement).scrollIntoView({
					block: 'nearest',
				})
			} else {
				this.property_container.ontransitionend = () =>
					(selectedElement as HTMLElement).scrollIntoView({
						behavior: 'smooth',
						block: 'nearest',
					})

				if (!isActive) {
					anime({
						targets: [...this.property_container.children],
						opacity: [0, 1],
						translateX: ['100%', '0'],
						easing: 'easeOutExpo',
						duration: 500,
						delay: anime.stagger(100, { start: 350 }),
					})
				}
			}
		})

		for (const container of this.drake!.containers) {
			mutObserver.observe(container, {
				childList: true,
				subtree: true,
				attributeFilter: ['class'],
			})
		}

		// Add active group state on scroll
		const activeElements = new Set<HTMLElement>()

		const scrollObserver = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					if (entry.isIntersecting)
						activeElements.add(entry.target as HTMLElement)
					else activeElements.delete(entry.target as HTMLElement)
				}

				const sortedInstances = (
					[...activeElements.values()]
						.map(el => Wezzle.getInstance(el))
						.filter(wz => wz !== undefined) as Wezzle[]
				).sort((a, b) => a.data.group - b.data.group)

				if (sortedInstances.length === 0) return

				const firstElementVisible =
					entries[0].isIntersecting &&
					entries[0].target ===
						this.template_container.children.item(0)

				const wzGroup = firstElementVisible
					? Wezzle.getInstance(
							this.template_container.children.item(
								0
							) as HTMLElement
					  )?.data.group
					: sortedInstances.slice(-1)[0].data.group

				;[...this.group_container.children].forEach((el, index) =>
					el.classList.toggle('active', index === wzGroup)
				)
			},
			{
				threshold: 1,
			}
		)

		for (const template of this.template_container.children) {
			scrollObserver.observe(template)
		}

		return this
	}

	#panelSetup() {
		const sizeData = localStorage.getItem('play-preview-sizes')
		const sizes = sizeData ? JSON.parse(sizeData) : [33, 67]

		if (this.#splitInstance) this.#splitInstance.destroy()
		this.#splitInstance = Split(['#left-panel', this.preview_container], {
			direction:
				global.util.deviceOrientation() === 'portrait'
					? 'vertical'
					: 'horizontal',
			sizes,
			minSize: global.util.deviceTypeByWidth() === 'phone' ? 150 : 250,
			gutterSize:
				global.util.deviceTypeByWidth() === 'desktop'
					? 30
					: global.util.deviceTypeByWidth() === 'tablet'
					? 20
					: 10,
			onDragEnd(sizes) {
				localStorage.setItem(
					'play-preview-sizes',
					JSON.stringify(sizes)
				)
			},
		})
	}

	#dragAPI() {
		this.drake = dragula(
			[this.template_container, this.instance_container],
			{
				copy: (_, source) => {
					return source === this.template_container
				},
				accepts: (el, target) => {
					return (
						(target === this.instance_container ||
							target?.closest('#wz-playground') ===
								this.instance_container) &&
						target !== this.property_container &&
						el !== undefined &&
						target !== undefined &&
						![...el.querySelectorAll('.contents')].includes(target)
					)
				},
				invalid: (_, target) => {
					return (
						target === undefined ||
						target.classList.contains('wz-extender')
					)
				},
				moves: el => {
					return (
						el !== undefined &&
						(el.classList.contains('wz') ||
							el.classList.contains('wz-extendable'))
					)
				},
				removeOnSpill: true,
				slideFactorX:
					global.util.deviceTypeByWidth() === 'phone' ? 30 : 0,
				slideFactorY:
					global.util.deviceTypeByWidth() === 'phone' ? 30 : 0,
			}
		)

		this.drake
			.on('drop', el => this.#addInstance(el, this.drake))
			.on('shadow', (_, container) => {
				if (!container.classList.contains('contents')) return
				;(container as HTMLElement).style.maxHeight =
					(container as HTMLElement).offsetHeight * 2 +
					+getComputedStyle(container).padding.replace('px', '') +
					'px'
			})

		// Touch devices
		this.template_container.addEventListener('touchmove', e => {
			const target = e.targetTouches[0].target as HTMLElement
			if (
				target.classList.contains('wz') ||
				target.classList.contains('wz-extendable')
			) {
				e.preventDefault()
			}
		})
	}

	#autoScroll() {
		if (!this.drake) return

		const drake = this.drake

		autoScroll(this.drake.containers, {
			margin: 30,
			maxSpeed: 6,
			scrollWhenOutside: false,
			autoScroll: function () {
				return this.down && drake.dragging
			},
		})
	}

	#addInstance(el: Element, drake?: dragula.Drake) {
		const instance = WezzleInstance.getInstance(el as HTMLElement)
		const extender = instance?.element.querySelector(
			':scope > .wz-extender'
		) as HTMLElement

		const extenderContainer = extender?.querySelector(
			':scope > .contents'
		) as HTMLElement

		if (!instance) return

		// Add wezzle selection
		instance.element.onclick = () => {
			;[
				...this.instance_container.querySelectorAll(
					':is(.wz, .wz-extendable).selected'
				),
			]
				.filter(el => el !== instance.element)
				.forEach(el => el.classList.remove('selected'))

			instance.element.classList.toggle('selected')
		}

		// Add toggle state to extender
		if (!extender) return
		extender.onclick = e => {
			e.stopPropagation()

			if (e.target !== extender) return
			extender?.classList.toggle('expanded')
		}

		if (extenderContainer) {
			drake?.containers.push(extenderContainer)
		}
	}

	parse() {
		const children = [
			...this.instance_container.querySelectorAll(
				':scope > :is(.wz, .wz-extendable)'
			),
		] as HTMLElement[]

		const parsed = getWezzleOrder(children)

		const parsedElements = document.createElement('div')
		updatePreview(parsed, parsedElements)
		parseStyles(parsedElements)

		this.preview_container.contentDocument!.body.innerHTML =
			parsedElements.innerHTML

		type parsedWezzle =
			| WezzleInstance
			| { parent: WezzleInstance; children: parsedWezzle[] }
		type parsedStringWezzle =
			| string
			| { parent: string; children: parsedStringWezzle[] }

		global.dev.logJSON(parsed.map(getParsedName))

		function getWezzleOrder(elements: HTMLElement[]) {
			const arr = new Array<parsedWezzle>()

			elements.forEach(el => {
				const contents = el.querySelector(
					':scope > .wz-extender > .contents'
				)

				if (contents === null || !contents.hasChildNodes())
					arr.push(WezzleInstance.getInstance(el))
				else
					arr.push({
						parent: WezzleInstance.getInstance(el),
						children: getWezzleOrder([
							...contents.querySelectorAll(
								':scope > :is(.wz, .wz-extendable)'
							),
						] as HTMLElement[]),
					})
			})

			return arr
		}

		function getParsedName(wz: parsedWezzle): parsedStringWezzle {
			return wz instanceof WezzleInstance
				? wz.data.parsed_name
				: {
						parent: wz.parent.data.parsed_name,
						children: wz.children.map(getParsedName),
				  }
		}

		function updatePreview(arr: parsedWezzle[], el: Element) {
			arr.forEach(wz => {
				const parsedElement =
					wz instanceof WezzleInstance
						? new global.util.ExtendedElement(wz.data.parsed_name)
						: new global.util.ExtendedElement(
								wz.parent.data.parsed_name
						  )

				el.appendChild(parsedElement.element)
				parseProps(
					wz instanceof WezzleInstance ? wz : wz.parent,
					parsedElement
				)

				if (wz instanceof WezzleInstance === false) {
					updatePreview(wz.children, parsedElement.element)
				}
			})
		}

		function parseProps(
			wezzle: WezzleInstance,
			el: global.util.ExtendedElement
		) {
			wezzle.data.properties.forEach(prop => {
				switch (prop.token) {
					case 'Text Content':
						el.html(prop.value ?? '')
						break

					case 'Initial Value':
						if (prop.input_type === 'multiline-text')
							el.html(prop.value ?? '')
						else if (prop.input_type === 'select')
							el.children
								.find(
									item => item.getProp('value') === prop.value
								)
								?.setProp('selected', 'true')
						else el.setProp('value', prop.value ?? '')

						break

					case 'Placeholder':
						el.setProp(
							'placeholder',
							prop.value || '<' + wezzle.data.name + '>'
						)
						break

					case 'Alignment':
						if (!prop.value || prop.value === 'auto') break

						el.setStyle('display', 'flex').setStyle(
							'flex-direction',
							prop.value === 'horizontal' ? 'row' : 'column'
						)

						break
					case 'Style Name':
						el.setProp('data-name', prop.value ?? '')
						break

					case 'Style Value':
						el.setProp('data-value', prop.value ?? '')
						break

					case 'Input Type':
						el.setProp('type', prop.value ?? 'text')
				}
			})
		}

		function parseStyles(parsedElement: HTMLElement) {
			const styleTags = parsedElement.querySelectorAll('style')

			styleTags.forEach(style => {
				const nearestElement = global.util.findElementMatch(
					style,
					'previous',
					el => el.tagName !== 'style'
				)

				console.log(nearestElement)
				if (nearestElement === null) {
				} else if (style.dataset.name && style.dataset.value) {
					const modifiedName = global.util.camelToDisplay(
						style.dataset.name
					)

					;(nearestElement as HTMLElement).style.setProperty(
						modifiedName,
						style.dataset.value
					)
				}

				style.remove()
			})
		}
	}

	#handleProps(instance: WezzleInstance) {
		if (!instance.element.classList.contains('selected')) return

		this.property_container.innerHTML = ''
		const properties = instance.data.properties

		properties.forEach(property => {
			let el: global.util.ExtendedElement
			const additionalElements = []

			const update = (val: string) => {
				property.value = val
				this.parse()
			}

			switch (property.input_type) {
				case 'text':
					el = new global.util.ExtendedInputElement('input')
						.setProp('type', 'text')
						.bind(property.value, update)
					break
				case 'multiline-text':
					el = new global.util.ExtendedInputElement('textarea').bind(
						property.value,
						update
					)
					break
				case 'number':
					el = new global.util.ExtendedInputElement('input')
						.setProp('type', 'number')
						.bind(property.value, update)
					break
				case 'select':
					el = new global.util.ExtendedInputElement('select')
					if (
						property.options === undefined ||
						property.options.length === 0
					)
						el.append(
							new global.util.ExtendedElement('option')
								.html('<No option added>')
								.setProp('disabled', 'true')
								.setProp('selected', 'true')
						)
					else {
						property.options.forEach(opt =>
							el.append(
								new global.util.ExtendedElement('option')
									.html(opt.display_text)
									.id(opt.value)
									.setProp('value', opt.value)
							)
						)
					}
					;(el as global.util.ExtendedInputElement).bind(
						property.value,
						update
					)
					break

				case 'text-with-datalist':
					const uniqID = Math.random().toString(16).substring(2, 8)
					el = new global.util.ExtendedInputElement('input')
						.setProp('type', 'text')
						.setProp('list', 'datalist-' + uniqID)
						.bind(property.value, update)

					if (
						property.options !== undefined &&
						property.options.length > 0
					) {
						additionalElements.push(
							new global.util.ExtendedElement('datalist')
								.id('datalist-' + uniqID)
								.append(
									...property.options.map(opt =>
										new global.util.ExtendedElement(
											'option'
										)
											.html(opt.display_text)
											.setProp('value', opt.value)
									)
								)
						)
					}
			}

			let label = new global.util.ExtendedElement('label')
				.html(property.token)
				.append(el)

			this.property_container.appendChild(label.element)
			this.property_container.append(
				...additionalElements.map(el => el.element)
			)
		})
	}
}