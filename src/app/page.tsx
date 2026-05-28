'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/types/types'

export default function SafePlayerPage() {
  const [nickname, setNickname] = useState('')
  const [joined, setJoined] = useState(false)
  const [gameId, setGameId] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState('lobby')
  const [currentSequence, setCurrentSequence] = useState(0)
  
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const [choices, setChoices] = useState<any[]>([])
  const [hasAnswered, setHasAnswered] = useState(false)

  // Absolute master values tracked dynamically from host stream
  const [isIntroducing, setIsIntroducing] = useState(true)
  const [timeLeft, setTimeLeft] = useState(30)

  const [isWinner, setIsWinner] = useState(false)
  const [winningName, setWinningName] = useState('')
  const [loadingResult, setLoadingResult] = useState(false)

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    const { data: activeGames } = await supabase
      .from('games')
      .select('id, phase, quiz_set_id, current_question_sequence')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!activeGames || activeGames.length === 0) {
      alert('No active rooms found!')
      return
    }

    const targetGame = activeGames[0]

    const { data: nameCheck } = await supabase
      .from('participants')
      .select('id')
      .eq('game_id', targetGame.id)
      .ilike('nickname', nickname.trim())

    if (nameCheck && nameCheck.length > 0) {
      alert('That nickname is taken! Please add your last initial.')
      return
    }

    setGameId(targetGame.id)
    setGamePhase(targetGame.phase)
    setCurrentSequence(targetGame.current_question_sequence)

    const { data: player, error } = await supabase
      .from('participants')
      .insert({ nickname: nickname.trim(), game_id: targetGame.id } as any)
      .select().single()

    if (error) return alert(error.message)

    setParticipantId(player.id)
    setJoined(true)
    fetchSyncDetails(targetGame.quiz_set_id, targetGame.current_question_sequence)
  }

  const fetchSyncDetails = async (quizSetId: string, sequence: number) => {
    const { data: quizData } = await supabase
      .from('quiz_sets')
      .select(`questions(*, choices(*))`)
      .eq('id', quizSetId)
      .single()

    if (quizData && quizData.questions) {
      const sortedQuestions = [...quizData.questions].sort((a: any, b: any) => a.order - b.order)
      const activeQuestion = sortedQuestions[sequence]
      
      if (activeQuestion) {
        setActiveQuestionId(activeQuestion.id)
        setCurrentQuestionText(activeQuestion.body || 'Get Ready...')
        setChoices(activeQuestion.choices || [])
      }
    }
  }

  const checkPlacement = useCallback(async (targetGameId: string) => {
    setLoadingResult(true)
    const { data: players } = await supabase
      .from('participants')
      .select('id, nickname')
      .eq('game_id', targetGameId)

    if (!players || players.length === 0) {
      setLoadingResult(false)
      return
    }

    const playerIds = players.map((p: any) => String(p.id))
    const { data: answersRows } = await supabase
      .from('answers')
      .select('participant_id, score')
      .in('participant_id', playerIds)

    const scoreMap: Record<string, number> = {}
    playerIds.forEach(id => { scoreMap[id] = 0 })

    if (answersRows) {
      answersRows.forEach((ans: any) => {
        const pId = String(ans.participant_id)
        if (scoreMap[pId] !== undefined) {
          scoreMap[pId] += Number(ans.score || 0)
        }
      })
    }

    let topPlayerId = playerIds[0]
    let maxScore = -1
    playerIds.forEach(id => {
      if (scoreMap[id] > maxScore) {
        maxScore = scoreMap[id]
        topPlayerId = id
      }
    })

    const winnerObj = players.find((p: any) => String(p.id) === topPlayerId)
    if (winnerObj) {
      setWinningName(winnerObj.nickname)
      if (winnerObj.nickname.toLowerCase() === nickname.toLowerCase()) {
        setIsWinner(true)
      }
    }
    setLoadingResult(false)
  }, [nickname])

  useEffect(() => {
    if (gamePhase === 'result' && gameId) checkPlacement(gameId)
  }, [gamePhase, gameId, checkPlacement])

  // MASTER SYNC STREAM
  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel('safe_player_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: any) => {
          const updated = payload.new
          setGamePhase(updated.phase)
          setCurrentSequence(updated.current_question_sequence)
          
          if (updated.dynamic_time_left !== undefined) {
            setTimeLeft(Number(updated.dynamic_time_left))
          }
          if (updated.dynamic_is_introducing !== undefined) {
            setIsIntroducing(Boolean(updated.dynamic_is_introducing))
          }

          if (updated.current_question_sequence !== currentSequence) {
            setHasAnswered(false)
            fetchSyncDetails(updated.quiz_set_id, updated.current_question_sequence)
          }
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, currentSequence])

  const handleSelectChoice = async (choice: any) => {
    if (hasAnswered || !participantId || !activeQuestionId || isIntroducing || timeLeft <= 0 || gamePhase === 'show_results') {
      return
    }
    setHasAnswered(true)

    await supabase.from('answers').insert({
      participant_id: participantId,
      question_id: activeQuestionId,
      choice_id: choice.id,
      score: choice.is_correct ? 100 : 0
    } as any)
  }

  const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']

  if (!joined) {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 text-white pt-8">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-8 shadow-2xl text-center">
          <div className="mb-4">
            <span className="text-3xl font-black block tracking-tight text-[#1e3a8a] uppercase leading-none">WSA</span>
            <span className="text-xs font-bold tracking-widest text-gray-400 block uppercase mt-1">Wallace Stegner Academy</span>
          </div>
          <form onSubmit={handleJoinGame} className="space-y-4">
            <input type="text" maxLength={12} placeholder="YOUR NICKNAME" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-lg font-black tracking-wide uppercase" required />
            <button type="submit" className="w-full bg-gray-900 text-white font-black text-lg py-4 rounded-xl uppercase tracking-wider">Enter Game</button>
          </form>
        </div>
      </main>
    )
  }

  if (gamePhase === 'lobby') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center text-white pt-8">
        <h2 className="text-2xl font-black uppercase">Registered!</h2>
        <p className="mt-2 font-bold bg-white/20 px-3 py-1 rounded">{nickname}</p>
      </main>
    )
  }

  if (gamePhase === 'quiz' || gamePhase === 'show_results' || timeLeft <= 0) {
    return (
      <main className="bg-gray-100 min-h-screen w-full flex flex-col text-gray-900 select-none pt-8">
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold">Q: {currentSequence + 1}</div>
        </div>
        
        <div className="w-full max-w-md mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <h2 className="text-lg font-extrabold text-gray-800 mb-2">{currentQuestionText}</h2>
            <div className={`inline-block px-3 py-0.5 rounded-full text-xs font-black ${isIntroducing ? 'bg-blue-50 text-blue-600' : (gamePhase === 'show_results' || timeLeft <= 0) ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
              {isIntroducing ? '👀 Previewing...' : (gamePhase === 'show_results' || timeLeft <= 0) ? '⏰ Time Up!' : '⏱️ Active Round'}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center items-center">
          {isIntroducing ? (
            <div className="text-center bg-white/80 backdrop-blur p-6 rounded-2xl shadow-md w-full border border-gray-200/50 animate-pulse">
              <span className="text-sm font-black text-[#1e3a8a] uppercase tracking-wider block">Get Ready!</span>
            </div>
          ) : (gamePhase === 'show_results' || timeLeft <= 0) ? (
            <div className="text-center bg-white p-6 rounded-2xl shadow-md w-full border border-gray-200 text-gray-400 font-bold uppercase tracking-wide">
              ⏰ Locked out! Look at board for results.
            </div>
          ) : !hasAnswered ? (
            <div className="w-full h-full flex flex-col justify-between gap-2.5">
              {choices.map((choice, idx) => (
                <button key={choice.id} onClick={() => handleSelectChoice(choice)} className={`w-full flex-1 min-h-[68px] ${gridColors[idx % 4]} text-white text-lg font-black rounded-xl shadow-md border-b-4 border-black/20 uppercase tracking-wide transition-all active:scale-95`}>
                  {choice.body}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-6 rounded-2xl shadow-xl w-full">
              <h3 className="text-xl font-black text-[#1e3a8a] uppercase">Answer Locked In!</h3>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (gamePhase === 'result') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 text-white text-center select-none pt-8">
        {loadingResult ? (
          <p className="font-bold text-xl animate-pulse">Calculating scores...</p>
        ) : isWinner ? (
          <div className="bg-yellow-400 text-gray-900 rounded-3xl p-8 shadow-2xl max-w-sm w-full border-4 border-white">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-3xl font-black tracking-tight uppercase">YOU WON!</h2>
            <p className="font-extrabold text-sm mt-2 tracking-wide text-amber-950">
              📸 SCREENSHOT THIS WIN! It is proof you had the most knowledge!
            </p>
            <div className="mt-6 bg-white rounded-xl py-3 px-4 font-black tracking-wide border-2 border-amber-600">
              {nickname.toUpperCase()}
            </div>
          </div>
        ) : (
          <div className="bg-white text-gray-900 rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-gray-100">
            <div className="text-4xl mb-2">🤝</div>
            <h2 className="text-2xl font-black tracking-tight text-[#1e3a8a] uppercase">THANK YOU FOR PLAYING!</h2>
            <p className="text-sm text-gray-500 font-bold mt-2 leading-relaxed">
              Sorry, maybe next time! 🌟<br />
              Winner: <span className="font-black text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{winningName || '---'}</span>
            </p>
            <div className="mt-6 pt-4 border-t border-gray-100 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
              Wallace Stegner Academy
            </div>
          </div>
        )}
      </main>
    )
  }

  return null
}
