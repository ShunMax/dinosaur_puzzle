import { memo } from 'react'

type Props = {
	id: string
	x: number
	y: number
	rotationDeg?: number
	fixed?: boolean
	src: string // 画像またはSVG
	width: number
	height: number
	onPointerDown: (id: string, e: React.PointerEvent<SVGElement>) => void
  hitMode?: 'center' | 'image'
}

function Piece(props: Props) {
	// 中心ホットスポットの半径を画像サイズから自動調整（12px〜48px）
	const r = Math.max(12, Math.min(48, Math.min(props.width, props.height) * 0.2))
	return (
		<g
			data-id={props.id}
			transform={`translate(${props.x} ${props.y}) rotate(${props.rotationDeg ?? 0})`}
			style={{ touchAction: 'none', cursor: 'default' }}
		>
			<image
				href={props.src}
				x={-props.width / 2}
				y={-props.height / 2}
				width={props.width}
				height={props.height}
				preserveAspectRatio="xMidYMid meet"
				pointerEvents={props.hitMode === 'image' ? 'visible' : 'none'}
				style={props.hitMode === 'image' ? { cursor: props.fixed ? 'default' : 'grab' } : undefined}
				onPointerDown={props.hitMode === 'image' ? (e) => props.onPointerDown(props.id, e) : undefined}
			/>
			{(props.hitMode ?? 'center') === 'center' && (
				<circle
					cx={0}
					cy={0}
					r={r}
					fill="rgba(0,0,0,0.001)" /* ほぼ透明だが確実にヒット */
					stroke="none"
					style={{ cursor: props.fixed ? 'default' : 'grab' }}
					pointerEvents="all"
					onPointerDown={(e) => props.onPointerDown(props.id, e)}
				/>
			)}
		</g>
	)
}

export default memo(Piece)

