// スナップ判定・補正

export const SNAP_POS_PX = 8
export const SNAP_ANGLE_DEG = 5
export const SNAP_LOCK_AFTER = false // trueにすると固定（再ドラッグ不可）

export function shouldSnap(
	currentX: number,
	currentY: number,
	currentRotationDeg: number,
	correctX: number,
	correctY: number
): boolean {
	const dx = currentX - correctX
	const dy = currentY - correctY
	const dist = Math.hypot(dx, dy)
	const angle = normalizeDeg(currentRotationDeg)
	return dist <= SNAP_POS_PX && Math.abs(angle) <= SNAP_ANGLE_DEG
}

export function shouldSnapWith(
	currentX: number,
	currentY: number,
	currentRotationDeg: number,
	correctX: number,
	correctY: number,
	pxTolerance: number,
	degTolerance: number
): boolean {
	const dx = currentX - correctX
	const dy = currentY - correctY
	const dist = Math.hypot(dx, dy)
	const angle = normalizeDeg(currentRotationDeg)
	return dist <= pxTolerance && Math.abs(angle) <= degTolerance
}

export function applySnap(
	correctX: number,
	correctY: number
): { x: number; y: number; rotationDeg: number; fixed: boolean } {
	return { x: correctX, y: correctY, rotationDeg: 0, fixed: SNAP_LOCK_AFTER }
}

export function normalizeDeg(deg: number): number {
	let d = ((deg % 360) + 360) % 360
	if (d > 180) d -= 360
	return d
}



