// localStorage 保存/読込

import type { PuzzleState } from './pieceGen'

const KEY = 'dino-puzzle:v1'

export function saveState(state: PuzzleState) {
	try {
		localStorage.setItem(KEY, JSON.stringify(state))
	} catch {}
}

export function loadState(): PuzzleState | null {
	try {
		const v = localStorage.getItem(KEY)
		if (!v) return null
		return JSON.parse(v) as PuzzleState
	} catch {
		return null
	}
}

export function clearState() {
	try {
		localStorage.removeItem(KEY)
	} catch {}
}



