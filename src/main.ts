import anime from 'animejs'

import { FileManager } from './wezzle-project/filesystem'
import { ExportWezzle } from './wezzle-project/wezzle/types'

import Swup from "swup"
import loadProject from './wezzle-main'
import SwupPreloadPlugin from '@swup/preload-plugin'

//
const app = document.getElementById('app') as HTMLElement
const splashscreen = fetch('/splashscreen.svg')

const swup = new Swup({
	plugins: [
		new SwupPreloadPlugin()
	]
})

document.addEventListener('DOMContentLoaded', () => {
	const recentbtn = document.getElementById('open-recent') as HTMLButtonElement

	try {
		const projData = localStorage.getItem('local-project-data')
		if (!projData) throw new Error()
		const data = JSON.parse(projData) as Array<any>

		if (data.length > 0) recentbtn.style.display = ''
	} catch (error) {
		localStorage.removeItem('local-project-data')
	}
	
	splashscreen
		.then(response => response.text())
		.then(contents => {
			app.innerHTML = contents + app.innerHTML
            app.style.opacity = '1'

			animateSplashscreen()
		})
})

function animateSplashscreen() {
	const splashscreen = document.getElementById('splashscreen') as HTMLElement

	anime({
		targets: '#splashscreen path[mask]',
		strokeDashoffset: [anime.setDashoffset, 0],
		easing: 'easeInOutQuart',
		duration: 800,
		delay: anime.stagger(70, { from: 'last' }),

		complete: async() => {
			splashscreen.classList.add('completed')
			app.classList.add('loaded')

			await swup.preload!('/project')

			load()
		},
	})
}

async function load() {
	const newbtn = document.getElementById('create-new') as HTMLButtonElement
	const openbtn = document.getElementById('open-file') as HTMLButtonElement
	const recentbtn = document.getElementById('open-recent') as HTMLButtonElement

	recentbtn.onclick = toProject

	openbtn.onclick = async () => {
		FileManager.instance
			.uploadFromHome()
			.then((data: ExportWezzle[]) => {
				localStorage.setItem('local-project-data', JSON.stringify(data))
				toProject()
			})
	}
	newbtn.onclick = () => {
		localStorage.removeItem('local-project-data')
		toProject()
	}

	function toProject() {
		swup.navigate('/project', { history: 'replace' })
		swup.hooks.on('page:view', loadProject)
	}
}
