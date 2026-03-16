import { useEffect, useRef, useState } from 'react'
import './Player.css'

function generateArt(ctx, seed) {
  const colors = ['#5dff6e','#ffcc00','#ff4444','#44aaff','#ff88cc']
  const c1 = colors[seed % colors.length]
  const c2 = colors[(seed + 2) % colors.length]
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, 22, 22)
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < 22; x++) {
      const v = ((x ^ y) + (seed * 7 + x * 3 + y * 5)) % 17
      if (v < 3) { ctx.fillStyle = c1; ctx.fillRect(x, y, 1, 1) }
      else if (v < 5) { ctx.fillStyle = c2; ctx.fillRect(x, y, 1, 1) }
    }
  }
  ctx.fillStyle = '#111'
  ctx.fillRect(8, 8, 6, 6)
  ctx.fillStyle = c1
  ctx.fillRect(9, 9, 4, 4)
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${m}:${sec}`
}

export default function Player({
  queue, currentIdx, isPlaying,
  onTogglePlay, onNext, onPrev, onSeek, onEnded,
  shuffle, onShuffle
}) {
  const audioRef  = useRef(null)
  const canvasRef = useRef(null)
  const [elapsed, setElapsed]   = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume]     = useState(80)
  const prevIdxRef = useRef(-1)

  const track = queue[currentIdx] || null

  // load new track when currentIdx changes
  useEffect(() => {
    if (!track) return
    if (prevIdxRef.current === currentIdx) return
    prevIdxRef.current = currentIdx

    const audio = audioRef.current
    audio.src = track.streamUrl
    audio.load()
    if (isPlaying) {
      audio.play().catch(() => {})
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.imageSmoothingEnabled = false
      generateArt(ctx, currentIdx * 7 + 3)
    }
  }, [currentIdx, track?.streamUrl])

  // sync play/pause state from room
  useEffect(() => {
    const audio = audioRef.current
    if (!audio.src) return
    if (isPlaying) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [isPlaying])

  // ws-seek event
  useEffect(() => {
    const handler = (e) => { audioRef.current.currentTime = e.detail }
    window.addEventListener('ws-seek', handler)
    return () => window.removeEventListener('ws-seek', handler)
  }, [])

  // when joining a room mid-song — sync to current time
  useEffect(() => {
    const handler = (e) => {
      if (audioRef.current) {
        audioRef.current.currentTime = e.detail
      }
    }
    window.addEventListener('ws-room-sync', handler)
    return () => window.removeEventListener('ws-room-sync', handler)
  }, [])

  const handleTimeUpdate = () => {
    setElapsed(audioRef.current.currentTime)
    setDuration(audioRef.current.duration || 0)
  }

  const handleProgressClick = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct  = (e.clientX - rect.left) / rect.width
    const time = pct * duration
    audioRef.current.currentTime = time
    onSeek(time)
  }

  const handleVolume = (e) => {
    const v = Number(e.target.value)
    setVolume(v)
    audioRef.current.volume = v / 100
  }

  const pct = duration ? (elapsed / duration) * 100 : 0

  return (
    <div className="pbox player">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={onEnded}
      />

      <div className="now-playing">
        <div className="album-art">
          <canvas ref={canvasRef} width="22" height="22" />
        </div>
        <div className="track-info">
          <div className="track-title">
            {track ? track.title.toUpperCase() : '[ NOTHING PLAYING ]'}
          </div>
          <div className="track-artist">
            {track ? track.artist : 'SEARCH A SONG BELOW →'}
          </div>
          <div className="progress-wrap" onClick={handleProgressClick}>
            <div className="progress-fill" style={{ width: pct + '%' }} />
          </div>
          <div className="time-row">
            <span>{fmt(elapsed)}</span>
            <div className={`eq ${isPlaying ? '' : 'paused'}`}>
              {[0,1,2,3].map(i => <div key={i} className="eq-bar" />)}
            </div>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      <div className="controls">
        <button className="btn" onClick={onPrev}>◀◀</button>
        <button className="btn primary" onClick={() => onTogglePlay(elapsed)}>
          {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
        <button className="btn" onClick={onNext}>▶▶</button>
        <button className={`btn ${shuffle ? 'active' : ''}`} onClick={onShuffle}>
          ⇄ SHUF
        </button>
      </div>

      <div className="vol-row">
        <span className="vol-label">VOL</span>
        <div className="vol-track">
          <div className="vol-fill" style={{ width: volume + '%' }} />
          <input type="range" min="0" max="100" value={volume} onChange={handleVolume} />
        </div>
        <span className="vol-num">{volume}</span>
      </div>
    </div>
  )
}