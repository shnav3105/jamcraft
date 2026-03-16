import { useState, useEffect, useRef, useCallback } from 'react'
import Player from './components/Player'
import Queue from './components/Queue'
import JamRoom from './components/JamRoom'
import Chat from './components/Chat'
import './App.css'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const WS_URL  = BACKEND.replace('http', 'ws')

export default function App() {
  const [queue, setQueue]         = useState([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [roomCode, setRoomCode]   = useState(null)
  const [players, setPlayers]     = useState(['YOU'])
  const [messages, setMessages]   = useState([])
  const [shuffle, setShuffle]     = useState(false)
  const wsRef = useRef(null)
  const nameRef = useRef('PLAYER-' + Math.random().toString(36).slice(2,5).toUpperCase())

  const addMsg = useCallback((who, text, system = false) => {
    setMessages(m => [...m, { who, text, system, id: Date.now() + Math.random() }])
  }, [])

  // WebSocket setup
  const connectWS = useCallback((code) => {
    const socket = new WebSocket(WS_URL)
    wsRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomCode: code, name: nameRef.current }
      }))
    }

    socket.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data)

      if (type === 'ROOM_STATE') {
        setQueue(payload.queue)
        setCurrentIdx(payload.currentIdx)
        setIsPlaying(payload.isPlaying)
        setPlayers(payload.players)
      }
      if (type === 'PLAYER_JOINED') {
        setPlayers(payload.players)
        addMsg('', `${payload.name} JOINED THE ROOM`, true)
      }
      if (type === 'PLAYER_LEFT') {
        setPlayers(payload.players)
        addMsg('', `${payload.name} LEFT THE ROOM`, true)
      }
      if (type === 'PLAY')   { setCurrentIdx(payload.idx); setIsPlaying(true) }
      if (type === 'PAUSE')  { setIsPlaying(false) }
      if (type === 'RESUME') { setIsPlaying(true) }
      if (type === 'SEEK')   { window.dispatchEvent(new CustomEvent('ws-seek', { detail: payload.time })) }
      if (type === 'ADD_SONG') { setQueue(q => [...q, payload.track]) }
      if (type === 'REMOVE_SONG') { setQueue(q => q.filter((_, i) => i !== payload.idx)) }
      if (type === 'CHAT')   { addMsg(payload.from, payload.text, false) }
    }

    socket.onclose = () => {
      setTimeout(() => connectWS(code), 3000)
    }
  }, [WS_URL, addMsg])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  // Room actions
  const createRoom = () => {
    const code = Math.random().toString(36).slice(2,8).toUpperCase()
    setRoomCode(code)
    setPlayers([nameRef.current])
    connectWS(code)
    addMsg('', 'ROOM ' + code + ' CREATED', true)
  }

  const joinRoom = (code) => {
    setRoomCode(code)
    connectWS(code)
    addMsg('', 'JOINING ROOM ' + code + '...', true)
  }

  const leaveRoom = () => {
    wsRef.current?.close()
    setRoomCode(null)
    setPlayers(['YOU'])
    setMessages([])
  }

  // Player actions — always broadcast if in room
  const playTrack = (idx) => {
    setCurrentIdx(idx)
    setIsPlaying(true)
    send({ type: 'PLAY', payload: { idx, time: 0 } })
  }

  const togglePlay = (time) => {
    if (isPlaying) {
      setIsPlaying(false)
      send({ type: 'PAUSE', payload: { time } })
    } else {
      setIsPlaying(true)
      send({ type: 'RESUME', payload: { time } })
    }
  }

  const seekTo = (time) => {
    send({ type: 'SEEK', payload: { time } })
  }

  const nextTrack = () => {
    if (!queue.length) return
    const next = shuffle
      ? Math.floor(Math.random() * queue.length)
      : Math.min(currentIdx + 1, queue.length - 1)
    playTrack(next)
    send({ type: 'NEXT', payload: { shuffle } })
  }

  const prevTrack = () => {
    if (currentIdx > 0) playTrack(currentIdx - 1)
  }

  const addSong = async (url) => {
    addMsg('', 'FETCHING: ' + url.slice(0,30) + '...', true)
    try {
      const [infoRes, audioRes] = await Promise.all([
        fetch(`${BACKEND}/info?url=${encodeURIComponent(url)}`),
        fetch(`${BACKEND}/audio?url=${encodeURIComponent(url)}`)
      ])
      const info  = await infoRes.json()
      const audio = await audioRes.json()
      if (audio.error) { addMsg('', 'ERROR: ' + audio.error, true); return }
      const track = { ...info, streamUrl: audio.streamUrl, ytUrl: url }
      setQueue(q => {
        const newQ = [...q, track]
        if (currentIdx === -1) setTimeout(() => playTrack(0), 100)
        return newQ
      })
      send({ type: 'ADD_SONG', payload: { track } })
      addMsg('', '+ ' + info.title, true)
    } catch {
      addMsg('', 'FAILED TO FETCH TRACK', true)
    }
  }

  const removeSong = (idx) => {
    setQueue(q => q.filter((_, i) => i !== idx))
    send({ type: 'REMOVE_SONG', payload: { idx } })
  }

  const sendChat = (text) => {
    send({ type: 'CHAT', payload: { from: nameRef.current, text } })
  }

  return (
    <div className="app-wrap">
      <header className="app-header">
        <div className="logo">JAM<span>CRAFT</span></div>
        <div className={`room-badge ${roomCode ? 'active' : ''}`}>
          <span className={`dot ${roomCode ? 'live' : ''}`} />
          {roomCode || 'NO ROOM'}
        </div>
      </header>

      <div className="app-grid">
        <div className="col-left">
          <Player
            queue={queue}
            currentIdx={currentIdx}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onNext={nextTrack}
            onPrev={prevTrack}
            onSeek={seekTo}
            onEnded={nextTrack}
            shuffle={shuffle}
            onShuffle={() => setShuffle(s => !s)}
          />
          <Queue
            queue={queue}
            currentIdx={currentIdx}
            onPlay={playTrack}
            onRemove={removeSong}
            onAdd={addSong}
          />
        </div>
        <div className="col-right">
          <JamRoom
            roomCode={roomCode}
            players={players}
            onCreate={createRoom}
            onJoin={joinRoom}
            onLeave={leaveRoom}
          />
          {roomCode && (
            <Chat
              messages={messages}
              onSend={sendChat}
              myName={nameRef.current}
            />
          )}
        </div>
      </div>
    </div>
  )
}