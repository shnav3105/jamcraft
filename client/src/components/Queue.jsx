import { useState } from 'react'
import './Queue.css'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function PixelLoader() {
  return (
    <div className="pixel-loader">
      <span /><span /><span />
    </div>
  )
}

export default function Queue({ queue, currentIdx, onPlay, onRemove, onAdd }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding]       = useState(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  const handleAdd = async (track) => {
    setAdding(track.id)
    await onAdd(track.url)
    setAdding(null)
    setResults([])
    setQuery('')
  }

  return (
    <div className="pbox queue">
      <div className="queue-header">
        <span>QUEUE</span>
        <span>{queue.length} TRACKS</span>
      </div>

      <div className="queue-list">
        {queue.length === 0
          ? <div className="queue-empty">EMPTY — SEARCH A SONG BELOW</div>
          : queue.map((t, i) => (
            <div
              key={i}
              className={`queue-item ${i === currentIdx ? 'active' : ''}`}
              onClick={() => onPlay(i)}
            >
              <span className="q-num">{i + 1}</span>
              <span className="q-title">{t.title}</span>
              <span className="q-dur">{t.dur}</span>
              <span
                className="q-remove"
                onClick={e => { e.stopPropagation(); onRemove(i) }}
              >✕</span>
            </div>
          ))
        }
      </div>

      <div className="queue-add">
        <div className="add-label">⌕ SEARCH SONGS</div>
        <div className="add-row">
          <input
            className="pixel-input"
            placeholder="SEARCH YOUTUBE..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            disabled={searching}
          />
          <button
            className="btn primary"
            onClick={handleSearch}
            disabled={searching}
            style={{ minWidth: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {searching ? <PixelLoader /> : 'GO'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {results.map(r => (
              <div key={r.id} className="search-item">
                <div className="search-info">
                  <div className="search-title">{r.title}</div>
                  <div className="search-meta">{r.artist} · {r.dur}</div>
                </div>
                <button
                  className="btn primary"
                  onClick={() => handleAdd(r)}
                  disabled={adding === r.id}
                  style={{ minWidth: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {adding === r.id ? <PixelLoader /> : '+ ADD'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}