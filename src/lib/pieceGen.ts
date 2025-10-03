// 形状生成・シード乱数・タイプ定義

export type DifficultyKey = 'easy' | 'normal' | 'hard'

export type DifficultySpec = {
	key: DifficultyKey
	label: string
	rows: number
	cols: number
}

export const DIFFICULTIES: DifficultySpec[] = [
	{ key: 'easy', label: 'やさしい', rows: 4, cols: 6 },
	{ key: 'normal', label: 'ふつう', rows: 6, cols: 10 },
	{ key: 'hard', label: 'むずかしい', rows: 9, cols: 14 },
]

export type PieceGeometry = {
	id: string
	row: number
	col: number
	// ローカル座標(0,0)をそのピースの本来のセル左上に合わせたパス
	pathLocal: string
	// 正解位置（ボード座標系）: ローカル(0,0)が置かれるべき座標
	correctX: number
	correctY: number
	cellWidth: number
	cellHeight: number
	// image のオフセット（ローカル座標→ボード画像原点）
	imageOffsetX: number
	imageOffsetY: number
}

export type GeneratedBoard = {
	boardWidth: number
	boardHeight: number
	rows: number
	cols: number
	pieces: PieceGeometry[]
}

// シード乱数（mulberry32）
export function createRng(seed: number) {
	let t = seed >>> 0
	return function rng() {
		t += 0x6D2B79F5
		let r = Math.imul(t ^ (t >>> 15), 1 | t)
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

export function hashStringToSeed(s: string): number {
	let h = 2166136261 >>> 0
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

type EdgePolarity = -1 | 0 | 1 // -1: スロット, 1: タブ, 0: 外枠

// ボードを rows x cols のグリッドに分割し、隣接境界に対してタブ/スロットを割り当てたピースのローカルパスを生成
export function generateBoard(
	rows: number,
	cols: number,
	boardWidth: number,
	boardHeight: number,
	rng: () => number
): GeneratedBoard {
	const cellWidth = boardWidth / cols
	const cellHeight = boardHeight / rows

	// 内部境界の極性を決める（水平と垂直）
	const horizontalPolarity: EdgePolarity[][] = [] // rows+1 x cols
	for (let r = 0; r <= rows; r++) {
		const rowArr: EdgePolarity[] = []
		for (let c = 0; c < cols; c++) {
			if (r === 0 || r === rows) rowArr.push(0)
			else rowArr.push(rng() < 0.5 ? -1 : 1)
		}
		horizontalPolarity.push(rowArr)
	}
	const verticalPolarity: EdgePolarity[][] = [] // rows x cols+1
	for (let r = 0; r < rows; r++) {
		const rowArr: EdgePolarity[] = []
		for (let c = 0; c <= cols; c++) {
			if (c === 0 || c === cols) rowArr.push(0)
			else rowArr.push(rng() < 0.5 ? -1 : 1)
		}
		verticalPolarity.push(rowArr)
	}

	// 形状パラメータ
	const notchScale = 0.25 // セルサイズに対するノッチの大きさ
	const pieces: PieceGeometry[] = []

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const left = c * cellWidth
			const top = r * cellHeight
			const id = `r${r}c${c}`
			const topPol = horizontalPolarity[r][c]
			const rightPol = verticalPolarity[r][c + 1]
			const bottomPol = horizontalPolarity[r + 1][c]
			const leftPol = verticalPolarity[r][c]

			const pathLocal = buildPiecePathLocal(
				cellWidth,
				cellHeight,
				{ top: topPol, right: rightPol, bottom: bottomPol, left: leftPol },
				notchScale,
				rng
			)

			pieces.push({
				id,
				row: r,
				col: c,
				pathLocal,
				correctX: left,
				correctY: top,
				cellWidth,
				cellHeight,
				imageOffsetX: left,
				imageOffsetY: top,
			})
		}
	}

	return { boardWidth, boardHeight, rows, cols, pieces }
}

function buildPiecePathLocal(
	cellW: number,
	cellH: number,
	edges: { top: EdgePolarity; right: EdgePolarity; bottom: EdgePolarity; left: EdgePolarity },
	notchScale: number,
	rng: () => number
): string {
	const nsW = cellW * notchScale
	const nsH = cellH * notchScale

	// ノッチの丸みをばらつかせる（再現性あり）
	const arcK = 0.55 + rng() * 0.15

	// 各辺のパスを組み立て（ローカル座標: 0..cellW, 0..cellH）
	const top = edgePath(0, 0, cellW, 0, 'h', edges.top, nsW, nsH, arcK)
	const right = edgePath(cellW, 0, cellW, cellH, 'v', edges.right, nsW, nsH, arcK)
	const bottom = edgePath(cellW, cellH, 0, cellH, 'h', (edges.bottom as number) * -1 as EdgePolarity, nsW, nsH, arcK)
	const left = edgePath(0, cellH, 0, 0, 'v', (edges.left as number) * -1 as EdgePolarity, nsW, nsH, arcK)

	return `M 0 0 ${top} ${right} ${bottom} ${left} Z`
}

// dir: 'h' 水平, 'v' 垂直。polarity: -1スロット, 1タブ, 0フラット
function edgePath(
	sx1: number,
	sy1: number,
	sx2: number,
	sy2: number,
	dir: 'h' | 'v',
	polarity: EdgePolarity,
	nsW: number,
	nsH: number,
	arcK: number
): string {
	if (polarity === 0) return `L ${sx2} ${sy2}`
	if (dir === 'h') {
		const len = Math.abs(sx2 - sx1)
		const mid = sx1 + len / 2
		const sign = polarity // 上辺: 1で上に出っ張る、-1で下へ凹む（ローカルではy負が上）
		const tipY = sy1 + -sign * nsH
		const leftMid = mid - nsW
		const rightMid = mid + nsW
		return [
			`L ${leftMid} ${sy1}`,
			`C ${leftMid + nsW * 0.2} ${sy1}, ${mid - nsW * 0.6} ${sy1 + -sign * nsH * 0.2}, ${mid} ${tipY}`,
			`C ${mid + nsW * 0.6} ${sy1 + -sign * nsH * 0.2}, ${rightMid - nsW * 0.2} ${sy1}, ${rightMid} ${sy1}`,
			`L ${sx2} ${sy2}`,
		].join(' ')
	} else {
		const len = Math.abs(sy2 - sy1)
		const mid = sy1 + len / 2
		const sign = polarity // 右辺: 1で右に出っ張る、-1で左に凹む
		const tipX = sx1 + sign * nsW
		const topMid = mid - nsH
		const bottomMid = mid + nsH
		return [
			`L ${sx1} ${topMid}`,
			`C ${sx1} ${topMid + nsH * 0.2}, ${sx1 + sign * nsW * 0.2} ${mid - nsH * 0.6}, ${tipX} ${mid}`,
			`C ${sx1 + sign * nsW * 0.2} ${mid + nsH * 0.6}, ${sx1} ${bottomMid - nsH * 0.2}, ${sx1} ${bottomMid}`,
			`L ${sx2} ${sy2}`,
		].join(' ')
	}
}

export type PuzzleStatePiece = {
	id: string
	translateX: number
	translateY: number
	rotationDeg: number
	fixed: boolean
}

export type PuzzleState = {
	imageDataUrl: string
	difficulty: DifficultyKey
	pieces: Record<string, PuzzleStatePiece>
}

// 将来: ピース結合グループの土台
export type PieceGroup = {
	groupId: string
	memberIds: string[]
}

// ========== 骨格パズル用のデータ定義 ==========
export type SkeletonPartId = 'head' | 'body' | 'leg_left' | 'leg_right' | 'tail'

export type SkeletonPart = {
	id: SkeletonPartId
	label: string
	src: string // 画像またはSVGのパス
	// 盤上の正解位置（px）
	correctX: number
	correctY: number
	width: number
	height: number
	// 任意: JSONで元キャンバス座標系を使う場合の表示順
	z?: number
	// 任意: アンカー（0..1）。未指定は中心(0.5,0.5)
	anchorX?: number
	anchorY?: number
	// 任意: トリミング画像の元キャンバス上の左上座標（px）
	originX?: number
	originY?: number
}

export type PartsJson =
	| SkeletonPart[]
	| {
		canvas?: { w: number; h: number }
		parts: (SkeletonPart & { correctX: number; correctY: number })[]
	}

export function getDefaultSkeletonParts(): SkeletonPart[] {
	// 盤サイズ（PuzzleBoard側と合わせる）
	const W = 1200
	const H = 600
	return [
		{ id: 'head', label: '頭骨', src: '/images/skeleton_parts/head.svg', correctX: W * 0.25, correctY: H * 0.42, width: 180, height: 120 },
		{ id: 'body', label: '胴体', src: '/images/skeleton_parts/body.svg', correctX: W * 0.45, correctY: H * 0.45, width: 260, height: 140 },
		{ id: 'leg_left', label: '左脚', src: '/images/skeleton_parts/leg_left.svg', correctX: W * 0.50, correctY: H * 0.68, width: 80, height: 160 },
		{ id: 'leg_right', label: '右脚', src: '/images/skeleton_parts/leg_right.svg', correctX: W * 0.62, correctY: H * 0.68, width: 80, height: 160 },
		{ id: 'tail', label: '尾', src: '/images/skeleton_parts/tail.svg', correctX: W * 0.78, correctY: H * 0.48, width: 200, height: 80 },
	]
}


