import { useState } from 'react'
import './JamRoom.css'

export default function JamRoom({ roomCode, players, onCreate, onJoin, onLeave }) {
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied]     = useState(false)

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="pbox jamroom">
      <div className="room-title">♪ JAM ROOM</div>

      {!roomCode ? (
        <>
          <button className="btn accent full" onClick={onCreate}>CREATE ROOM</button>
          <div className="room-or">— OR JOIN —</div>
          <div className="join-row">
            <input
              className="pixel-input join-input"
              placeholder="ROOM CODE..."
              maxLength={6}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinCode.length >= 4 && onJoin(joinCode)}
            />
            <button
              className="btn"
              onClick={() => onJoin(joinCode)}
              disabled={joinCode.length < 4}
            >JOIN</button>
          </div>
        </>
      ) : (
        <>
          <div className="code-display" onClick={copyCode} title="Click to copy">
            {roomCode}
          </div>
          <div className="code-hint">{copied ? 'COPIED! ✓' : 'CLICK TO COPY & SHARE'}</div>
          <div className="players-list">
            {players.map((p, i) => (
              <div key={i} className={`player-chip ${i === 0 ? 'you' : ''}`}>
                <span className="chip-dot" />
                {p}
              </div>
            ))}
          </div>
          <button className="btn danger full" onClick={onLeave}>LEAVE ROOM</button>
        </>
      )}
    </div>
  )
}