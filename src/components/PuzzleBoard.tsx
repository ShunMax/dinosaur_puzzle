import { useCallback, useEffect, useRef, useState } from 'react'
import Piece from './Piece'
import { shouldSnapWith, applySnap } from '../lib/snap'
import { getDefaultSkeletonParts, type SkeletonPart, type PartsJson } from '../lib/pieceGen'

type PointerInfo = { pointerId: number; offsetX: number; offsetY: number }

const BOARD_W = 1200
const BOARD_H = 600

type PartState = {
	id: string
	x: number
	y: number
	rotationDeg: number
	fixed: boolean
}

export default function PuzzleBoard() {
	const [ghost, setGhost] = useState(true)
	const [editMode, setEditMode] = useState(false)
	const [parts, setParts] = useState<SkeletonPart[]>(() => getDefaultSkeletonParts())
	const [scale, setScale] = useState(1)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [scaleById, setScaleById] = useState<Record<string, number>>({})
	const [preciseHit, setPreciseHit] = useState(false)
	const [hoverId, setHoverId] = useState<string | null>(null)
    const [fitToGhost, setFitToGhost] = useState(() => {
        try {
            const v = localStorage.getItem('puzzle:fitToGhost')
            return v ? v === '1' : true
        } catch { return true }
    })
    const [ghostSize, setGhostSize] = useState<{ w: number; h: number } | null>(null)
    const [autoFactor, setAutoFactor] = useState(() => {
        try {
            const v = localStorage.getItem('puzzle:autoFactor')
            return v ? parseFloat(v) || 1 : 1
        } catch { return 1 }
    })
	const [showHelp, setShowHelp] = useState(false)
	const [snapUiPx, setSnapUiPx] = useState(() => {
        try { const v = localStorage.getItem('puzzle:snapPx'); return v ? parseInt(v) : 32 } catch { return 32 }
    })
    const [snapUiDeg, setSnapUiDeg] = useState(() => {
        try { const v = localStorage.getItem('puzzle:snapDeg'); return v ? parseInt(v) : 5 } catch { return 5 }
    })
	const [state, setState] = useState<Record<string, PartState>>(() => {
		const init: Record<string, PartState> = {}
		for (const p of getDefaultSkeletonParts()) {
			init[p.id] = {
				id: p.id,
				x: Math.random() * (BOARD_W - 200) + 100,
				y: BOARD_H - 120 + Math.random() * 80,
				rotationDeg: 0,
				fixed: false,
			}
		}
		return init
	})
	const [completed, setCompleted] = useState(0)
	const svgRef = useRef<SVGSVGElement | null>(null)
	const draggingIdRef = useRef<string | null>(null)
	const pointerRef = useRef<PointerInfo | null>(null)
	const imageCacheRef = useRef<Map<string, { canvas: HTMLCanvasElement; width: number; height: number }>>(new Map())

	// JSONがあれば読み込み
	useEffect(() => {
        const url = `/images/skeleton_parts/parts.json?t=${Date.now()}`
        fetch(url, { cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
        if (!data) return
        if (Array.isArray(data)) {
          setParts(data as SkeletonPart[])
          return
        }
        const pj = data as PartsJson
        if ((pj as any).parts) {
          // 元キャンバス座標系運用: 描画時に一括スケール
          setParts((pj as any).parts)
          if ((pj as any).canvas) setGhostSize({ w: (pj as any).canvas.w, h: (pj as any).canvas.h })
        }
			})
			.catch(() => {})
	}, [])

	// parts 読み込み後に state を補完（足りないIDを初期化）
	useEffect(() => {
		if (!parts || parts.length === 0) return
		setState((prev) => {
			const next: Record<string, PartState> = { ...prev }
			for (const p of parts) {
				if (!next[p.id]) {
					next[p.id] = {
						id: p.id,
						x: Math.random() * (BOARD_W - 200) + 100,
						y: BOARD_H - 120 + Math.random() * 80,
						rotationDeg: 0,
						fixed: false,
					}
				}
			}
			return next
		})
	}, [parts])

	// 画像をキャッシュ（ピクセルヒット用）
	useEffect(() => {
		let alive = true
		async function loadAll() {
			const uniq = Array.from(new Set(parts.map((p) => p.src)))
			await Promise.all(
				uniq.map(
					(src) =>
						new Promise<void>((resolve) => {
							if (imageCacheRef.current.has(src)) return resolve()
							const img = new Image()
							img.onload = () => {
								if (!alive) return resolve()
								const canvas = document.createElement('canvas')
								canvas.width = img.naturalWidth
								canvas.height = img.naturalHeight
								const ctx = canvas.getContext('2d')!
								ctx.drawImage(img, 0, 0)
								imageCacheRef.current.set(src, { canvas, width: canvas.width, height: canvas.height })
								resolve()
							}
							img.onerror = () => resolve()
							img.src = src
						})
				)
			)
		}
		loadAll()
		return () => {
			alive = false
		}
	}, [parts])

	// ゴースト画像の実サイズを取得
	useEffect(() => {
		const img = new Image()
		img.onload = () => setGhostSize({ w: img.naturalWidth, h: img.naturalHeight })
		img.src = '/images/skeleton_ghost.png'
	}, [])

    // 設定の永続化
    useEffect(() => {
        try { localStorage.setItem('puzzle:autoFactor', String(autoFactor)) } catch {}
    }, [autoFactor])
    useEffect(() => {
        try { localStorage.setItem('puzzle:fitToGhost', fitToGhost ? '1' : '0') } catch {}
    }, [fitToGhost])
    useEffect(() => { try { localStorage.setItem('puzzle:snapPx', String(snapUiPx)) } catch {} }, [snapUiPx])
    useEffect(() => { try { localStorage.setItem('puzzle:snapDeg', String(snapUiDeg)) } catch {} }, [snapUiDeg])

	function calcGhostScale() {
		if (!ghostSize) return { s: 1, dx: 0, dy: 0 }
		const s = Math.min(BOARD_W / ghostSize.w, BOARD_H / ghostSize.h)
		const dx = (BOARD_W - ghostSize.w * s) / 2
		const dy = (BOARD_H - ghostSize.h * s) / 2
		return { s, dx, dy }
	}

	function getCorrectDisplayPos(p: SkeletonPart) {
		if (fitToGhost && ghostSize) {
			const { s, dx, dy } = calcGhostScale()
			// correctX/Yは元画像座標系なので、ゴーストのスケールsのみ適用
			return { x: p.correctX * s, y: p.correctY * s, dx, dy }
		}
		return { x: p.correctX, y: p.correctY, dx: 0, dy: 0 }
	}

	// getTargetCenters: deprecated (anchor対応のため廃止)

	function getDisplayedSize(p: SkeletonPart) {
		const cache = imageCacheRef.current.get(p.src)
		if (fitToGhost && cache && ghostSize) {
			const { s } = calcGhostScale()
			return { w: cache.width * s * autoFactor, h: cache.height * s * autoFactor }
		}
		const baseW = p.width * (scaleById[p.id] ?? 1)
		const baseH = p.height * (scaleById[p.id] ?? 1)
		return { w: baseW * scale, h: baseH * scale }
	}

	function getAnchor(p: SkeletonPart) {
		const ax = (p as any).anchorX ?? 0.5
		const ay = (p as any).anchorY ?? 0.5
		return { ax, ay }
	}

	function getTargetPoint(p: SkeletonPart) {
		// correctX/Y は元キャンバス上の基準点。トリミングしている場合はoriginで戻す
		const c = getCorrectDisplayPos(p)
		const sz = getDisplayedSize(p)
		const { ax, ay } = getAnchor(p)
		const ox = (p as any).originX ? (p as any).originX : 0
		const oy = (p as any).originY ? (p as any).originY : 0
		const { s } = calcGhostScale()
		const originOffsetX = ox * s // 元キャンバス→表示座標への変換
		const originOffsetY = oy * s
		// アンカーが(0.5,0.5)なら中心。左上(0,0)なら半分ずらす。さらにorigin分だけ左上に押し戻す
		const px = c.x + c.dx - (0.5 - ax) * sz.w + originOffsetX
		const py = c.y + c.dy - (0.5 - ay) * sz.h + originOffsetY
		return { x: px, y: py }
	}

	function getSnapCandidates(p: SkeletonPart) {
		const c = getCorrectDisplayPos(p)
		const sz = getDisplayedSize(p)
		const anchor = getTargetPoint(p)
		const center = { x: c.x + c.dx, y: c.y + c.dy }
		const topLeftAsCenter = { x: center.x + sz.w / 2, y: center.y + sz.h / 2 }
		return [anchor, center, topLeftAsCenter]
	}

	// 完成判定
	useEffect(() => {
		setCompleted(Object.values(state).filter((s) => s.fixed).length)
	}, [state])

// 個別onPointerDownは各要素側で設定

	const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
		const id = draggingIdRef.current
		if (!id) return
		const info = pointerRef.current
		if (!info) return
		setState((prev) => {
			const cur = prev[id]
			if (!cur) return prev
			return { ...prev, [id]: { ...cur, x: e.clientX - info.offsetX, y: e.clientY - info.offsetY } }
		})
	}, [])

	// ホバー判定（精密ヒット）
	const onSvgPointerMoveHover = useCallback(
		(e: React.PointerEvent<SVGSVGElement>) => {
			if (!preciseHit) return
			if (!svgRef.current) return
			const pt = svgRef.current.createSVGPoint()
			pt.x = e.clientX
			pt.y = e.clientY
			const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse())
			// 前面優先で探索（単純に末尾優先）
			for (let i = parts.length - 1; i >= 0; i--) {
				const p = parts[i]
				const st = state[p.id]
				if (!st || st.fixed) continue
				const sz = getDisplayedSize(p)
				const dispW = sz.w
				const dispH = sz.h
				// ポイントをピースローカルへ逆変換
				const lx = svgP.x - st.x
				const ly = svgP.y - st.y
				const rad = (-(st.rotationDeg || 0) * Math.PI) / 180
				const rx = lx * Math.cos(rad) - ly * Math.sin(rad)
				const ry = lx * Math.sin(rad) + ly * Math.cos(rad)
				if (rx < -dispW / 2 || rx > dispW / 2 || ry < -dispH / 2 || ry > dispH / 2) continue
				const cache = imageCacheRef.current.get(p.src)
				if (!cache) continue
				const u = (rx + dispW / 2) / dispW
				const v = (ry + dispH / 2) / dispH
				const sx = Math.floor(u * cache.width)
				const sy = Math.floor(v * cache.height)
				if (sx < 0 || sy < 0 || sx >= cache.width || sy >= cache.height) continue
				const ctx = cache.canvas.getContext('2d')!
				const alpha = ctx.getImageData(sx, sy, 1, 1).data[3]
				if (alpha >= 32) {
					setHoverId(p.id)
					return
				}
			}
			setHoverId(null)
		},
		[parts, state, scale, scaleById, preciseHit]
	)

	const onPointerUp = useCallback(() => {
		const id = draggingIdRef.current
		if (!id) return
		draggingIdRef.current = null
		pointerRef.current = null
		setState((prev) => {
			const cur = prev[id]
			if (!cur) return prev
			const part = parts.find((p) => p.id === id)!
			const candidates = getSnapCandidates(part)
			let best = { ok: false, x: 0, y: 0, dist: Infinity, label: 'anchor' as 'anchor' | 'center' | 'topLeft' }
			for (const [i, t] of candidates.entries()) {
				const dx = cur.x - t.x
				const dy = cur.y - t.y
				const dist = Math.hypot(dx, dy)
				const angleDiff = Math.abs(((cur.rotationDeg % 360) + 360) % 360)
				const ok = !editMode && shouldSnapWith(cur.x, cur.y, cur.rotationDeg, t.x, t.y, snapUiPx, snapUiDeg)
				if (ok && dist < best.dist) {
					best = { ok: true, x: t.x, y: t.y, dist, label: i === 0 ? 'anchor' : i === 1 ? 'center' : 'topLeft' }
				}
				console.log(`[候補${i === 0 ? 'anchor' : i === 1 ? 'center' : 'top-left'}] dist=${dist.toFixed(1)} (閾値${snapUiPx}), angle=${angleDiff.toFixed(1)} (閾値${snapUiDeg})`)
			}
			if (best.ok) {
				console.log(`✅ スナップ成功(${best.label}): id=${id}, dist=${best.dist.toFixed(1)}`)
				const sVal = applySnap(best.x, best.y)
				return { ...prev, [id]: { ...cur, x: sVal.x, y: sVal.y, rotationDeg: sVal.rotationDeg, fixed: true } }
			} else {
				console.log(`❌ スナップ失敗: どちらの基準でも閾値外`)
			}
			return prev
		})
	}, [parts, editMode, snapUiPx, snapUiDeg, fitToGhost, ghostSize, autoFactor, scaleById, scale])

	const onSvgPointerDown = useCallback(
		(e: React.PointerEvent<SVGSVGElement>) => {
			if (!preciseHit) return
			if (!hoverId) return
			const st = state[hoverId]
			if (!st || st.fixed) return
			if (!svgRef.current) return
			e.currentTarget.setPointerCapture(e.pointerId)
			draggingIdRef.current = hoverId
			pointerRef.current = { pointerId: e.pointerId, offsetX: e.clientX - st.x, offsetY: e.clientY - st.y }
			setSelectedId(hoverId)
		},
		[hoverId, state, preciseHit]
	)

	const viewBox = `0 0 ${BOARD_W} ${BOARD_H}`

	const isComplete = completed === parts.length

	function exportJson() {
		const { s, dx, dy } = calcGhostScale()
		const outParts = parts.map((p) => {
			const st = state[p.id]
			const sz = getDisplayedSize(p)
			const { ax, ay } = getAnchor(p)
			const ox = (p as any).originX ? (p as any).originX : 0
			const oy = (p as any).originY ? (p as any).originY : 0
			const dispX = st ? st.x : p.correctX * s + dx
			const dispY = st ? st.y : p.correctY * s + dy
			// 逆変換: correct = ((disp - dx) + (0.5-ax)*w - originOffset)/s
			const correctX = ((dispX - dx) + (0.5 - ax) * sz.w - ox * s) / s
			const correctY = ((dispY - dy) + (0.5 - ay) * sz.h - oy * s) / s
			const cache = imageCacheRef.current.get(p.src)
			const naturalW = cache ? cache.width : p.width
			const naturalH = cache ? cache.height : p.height
			return {
				id: p.id,
				label: p.label,
				src: p.src,
				correctX: Math.round(correctX),
				correctY: Math.round(correctY),
				width: naturalW,
				height: naturalH,
				z: (p as any).z ?? 1,
				anchorX: (p as any).anchorX ?? 0.5,
				anchorY: (p as any).anchorY ?? 0.5,
				originX: ox,
				originY: oy,
			}
		})
		const payload = { canvas: ghostSize ? { w: ghostSize.w, h: ghostSize.h } : { w: 1200, h: 600 }, parts: outParts }
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'parts.json'
		a.click()
		URL.revokeObjectURL(url)
	}

	return (
		<div className="board-wrap">
			<div className="toolbar" role="toolbar">
				<button aria-label="ゴースト表示切替" onClick={() => setGhost((v) => !v)}>
					ゴースト{ghost ? 'ON' : 'OFF'}
				</button>
				<button aria-label="編集モード切替" onClick={() => setEditMode((v) => !v)}>
					編集{editMode ? 'ON' : 'OFF'}
				</button>
				<button aria-label="精密ヒット切替" onClick={() => setPreciseHit((v) => !v)}>
					精密ヒット{preciseHit ? 'ON' : 'OFF'}
				</button>
				<button aria-label="ゴーストに自動合わせ切替" onClick={() => setFitToGhost((v) => !v)}>
					自動サイズ{fitToGhost ? 'ON' : 'OFF'}
				</button>
				{fitToGhost && (
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
						<span>自動補正</span>
						<input type="range" min={0.5} max={2} step={0.01} value={autoFactor} onChange={(e) => setAutoFactor(parseFloat(e.target.value))} />
						<span>{Math.round(autoFactor * 100)}%</span>
					</label>
				)}
				<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
					<span>スナップ距離</span>
                    <input type="range" min={2} max={32} step={1} value={snapUiPx} onChange={(e) => setSnapUiPx(parseInt(e.target.value))} />
                    <span>{snapUiPx}px</span>
				</label>
				<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
					<span>スナップ角度</span>
                    <input type="range" min={0} max={15} step={1} value={snapUiDeg} onChange={(e) => setSnapUiDeg(parseInt(e.target.value))} />
                    <span>±{snapUiDeg}°</span>
				</label>
				<button aria-label="配置を初期化" onClick={() => {
					setState((prev) => {
						const next: typeof prev = { ...prev }
						for (const p of parts) {
							next[p.id] = { id: p.id, x: Math.random() * (BOARD_W - 200) + 100, y: BOARD_H - 120 + Math.random() * 80, rotationDeg: 0, fixed: false }
						}
						return next
					})
				}}>リセット</button>
				<button aria-label="ヘルプ" onClick={() => setShowHelp(true)}>ヘルプ</button>
				<button aria-label="JSONを書き出し" onClick={exportJson} disabled={!editMode}>
					JSONダウンロード
				</button>
				<button aria-label="設定を既定値にリセット" onClick={() => {
                    setSnapUiPx(32); setSnapUiDeg(5); setAutoFactor(1); setFitToGhost(true);
                }}>設定リセット</button>
				<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
					<span>スケール</span>
					<input
						type="range"
						min={0.5}
						max={5}
						step={0.05}
						value={scale}
						onChange={(e) => setScale(parseFloat(e.target.value))}
					/>
					<span>{Math.round(scale * 100)}%</span>
				</label>
				{editMode && selectedId && (
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
						<span>選択:{selectedId}倍率</span>
						<input
							type="range"
							min={0.5}
							max={5}
							step={0.05}
							value={scaleById[selectedId] ?? 1}
							onChange={(e) => {
								const v = parseFloat(e.target.value)
								setScaleById((m) => ({ ...m, [selectedId]: v }))
							}}
						/>
					</label>
				)}
				<span aria-live="polite">進捗: {completed} / {parts.length}</span>
			</div>
			<div className="board-outer">
				<svg
					ref={svgRef}
					className="board-svg"
					viewBox={viewBox}
					onPointerMove={(e) => {
						onPointerMove(e)
						onSvgPointerMoveHover(e)
					}}
					onPointerUp={onPointerUp}
					onPointerDown={onSvgPointerDown}
					style={{ cursor: hoverId && !state[hoverId]?.fixed ? 'grab' : 'default' }}
				>
                    {ghost && (
                        ghostSize ? (
                            (() => {
                                const { s, dx, dy } = calcGhostScale()
                                const w = ghostSize.w * s
                                const h = ghostSize.h * s
                                return (
                                    <image
                                        href="/images/skeleton_ghost.png"
                                        x={dx}
                                        y={dy}
                                        width={w}
                                        height={h}
                                        opacity={0.2}
                                        preserveAspectRatio="none"
                                    />
                                )
                            })()
                        ) : (
                            <image href="/images/skeleton_ghost.png" x={0} y={0} width={BOARD_W} height={BOARD_H} opacity={0.2} />
                        )
                    )}
					{parts.map((p) => {
						const s = state[p.id] ?? {
							id: p.id,
							x: p.correctX ?? BOARD_W / 2,
							y: p.correctY ?? BOARD_H - 80,
							rotationDeg: 0,
							fixed: false,
						}
						return (
							<Piece
								key={p.id}
								id={p.id}
								src={p.src}
								x={s.x}
								y={s.y}
								width={getDisplayedSize(p).w}
								height={getDisplayedSize(p).h}
								fixed={s.fixed}
								hitMode={editMode ? 'image' : 'center'}
                                onPointerDown={(id, ev) => {
                                    if (!s.fixed) (ev.currentTarget as SVGElement).setPointerCapture(ev.pointerId)
                                    draggingIdRef.current = id
                                    pointerRef.current = { pointerId: ev.pointerId, offsetX: ev.clientX - s.x, offsetY: ev.clientY - s.y }
                                    setSelectedId(id)
                                }}
							/>
						)
					})}

					{/* 下部トレイのガイドライン */}
					<rect x={0} y={BOARD_H - 120} width={BOARD_W} height={120} fill="transparent" stroke="#e0e0e0" />
				</svg>
			</div>

			{showHelp && (
				<div className="status-bar" role="dialog" aria-modal="true" style={{ background: '#fff', border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
						<div>
							<p>使い方:</p>
							<ul>
								<li>編集ON: 画像全体を掴んで配置調整</li>
								<li>精密ヒットON: 透明部分で手が出ない（α判定）</li>
								<li>スケール/個別倍率: 大きさ調整</li>
								<li>JSONダウンロード: 現在の配置でparts.jsonを保存</li>
							</ul>
						</div>
						<button onClick={() => setShowHelp(false)} aria-label="ヘルプを閉じる">閉じる</button>
					</div>
				</div>
			)}

			{isComplete && (
				<div className="status-bar" aria-live="assertive" style={{ fontWeight: 700 }}>
					完成！
				</div>
			)}
		</div>
	)
}

