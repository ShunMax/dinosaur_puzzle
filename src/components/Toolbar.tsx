import { useRef } from 'react'
import type { DifficultyKey } from '../lib/pieceGen'

type Props = {
	imageName: string
	difficulty: DifficultyKey
	onChangeDifficulty: (d: DifficultyKey) => void
	onPickFile: (file: File) => void
	onShuffle: () => void
	ghost: boolean
	onToggleGhost: () => void
	rotationEnabled: boolean
	onToggleRotation: () => void
	onReset: () => void
	onFossilMode: () => void
}

export default function Toolbar(props: Props) {
	const fileRef = useRef<HTMLInputElement | null>(null)
	return (
		<div className="toolbar" role="toolbar" aria-label="パズル操作ツールバー">
			<button
				aria-label="画像を選択"
				onClick={() => fileRef.current?.click()}
			>
				画像選択
			</button>
			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={(e) => {
					const f = e.target.files?.[0]
					if (f) props.onPickFile(f)
				}}
			/>

			<select
				aria-label="難易度を選択"
				value={props.difficulty}
				onChange={(e) => props.onChangeDifficulty(e.target.value as DifficultyKey)}
			>
				<option value="easy">やさしい (6x4)</option>
				<option value="normal">ふつう (10x6)</option>
				<option value="hard">むずかしい (14x9)</option>
			</select>

			<button aria-label="ピースをシャッフル" onClick={props.onShuffle}>シャッフル</button>
			<button aria-label="ゴースト表示切替" onClick={props.onToggleGhost}>
				ゴースト{props.ghost ? 'ON' : 'OFF'}
			</button>
			<button aria-label="回転機能切替" onClick={props.onToggleRotation}>
				回転{props.rotationEnabled ? 'ON' : 'OFF'}
			</button>
			<button aria-label="進捗をリセット" onClick={props.onReset}>進捗リセット</button>
			<button aria-label="化石モード" onClick={props.onFossilMode}>化石モード</button>
		</div>
	)
}


