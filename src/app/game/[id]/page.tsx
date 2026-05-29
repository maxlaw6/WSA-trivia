'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/types/types'

export default function PlayerGamePage({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const [phase, setPhase] = useState<string>('join')
  const [nickname, setNickname] = useState('')
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  
  // Game State
  const [currentQuestionSequence, setCurrentQuestionSequence] = useState<number | null>(null)
  const [question, setQuestion] = useState<any>(null)
  const [choices, setChoices] = useState<any[]>([])
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // --- 0. LOCAL STORAGE RECOVERY ---
  useEffect(() => {
    const savedId = localStorage.getItem(`trivia_participant_${gameId}`)
    const savedName = localStorage.getItem(`trivia_nickname_${gameId}`)
    
    if (savedId) {
      setParticipantId(savedId)
      if (savedName) setNickname(savedName)
    }
  }, [gameId])

  // --- 1. CORE DATA FETCHING ---
  const fetchGameState = useCallback(async () => {
    const { data: game } = await supabase
      .from('games')
      .select('phase, current_question_sequence, quiz_set_id')
      .eq('id', gameId)
      .single()

    if (!game) return

    // Track the sequence change to reset submission windows safely
    setCurrentQuestionSequence((prevSequence) => {
      if (prevSequence !== null && prevSequence !== game.current_question_sequence) {
        setHasSubmitted(false)
        setSelectedChoice(null)
      }
      return game.current_question_sequence
    })
    
    if (!participantId && phase === 'join') {
      return
    }

    setPhase(game.phase)

    if (game.phase === 'quiz') {
      const { data: quizSet } = await supabase
        .from('quiz_sets')
        .select(`questions(*, choices(*))`)
        .eq('id', game.quiz_set_id)
        .single()

      if (quizSet && quizSet.questions) {
        const sortedQuestions = quizSet.questions.sort((a: any, b: any) => a.order - b.order)
        const currentQ = sortedQuestions[game.current_question_sequence]
        
        if (currentQ) {
          setQuestion(currentQ)
          const sortedChoices = currentQ.choices.sort((a: any, b: any) => a.id.localeCompare(b.id))
          setChoices(sortedChoices)

          // Auto-recover submission status if they already answered this question in the DB
          if (participantId) {
            const { data: existingAnswer } = await supabase
              .from('answers')
              .select('choice_id')
              .eq('participant_id', participantId)
              .eq('question_id', currentQ.id)
              .maybeSingle()

            if (existingAnswer) {
              setHasSubmitted(true)
              setSelectedChoice(existingAnswer.choice_id)
            }
          }
        }
      }
    }
  }, [gameId, participantId, phase])

  // --- 2. MOBILE SCREEN KEEP-ALIVE ---
  useEffect(() => {
    let wakeLock: any = null

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch (err) {
        console.log('Wake Lock denied')
      }
    }

    requestWakeLock()

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
        fetchGameState()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (wakeLock !== null) wakeLock.release()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchGameState])

  // --- 3. SUPABASE REAL-TIME SYNC ---
  useEffect(() => {
    fetchGameState()

    const channel = supabase
      .channel('player_sync_stream')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => {
          fetchGameState()
        }
      ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetchGameState, participantId])

  // --- 4. ACTION HANDLERS ---
  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    const cleanName = nickname.trim()

    const { data, error } = await supabase
      .from('participants')
      .insert([{ game_id: gameId, nickname: cleanName }])
      .select()
      .single()

    if (error) {
      alert("🚨 That name is already taken! Please pick a different one.")
      return
    }

    if (data) {
      setParticipantId(data.id)
      localStorage.setItem(`trivia_participant_${gameId}`, String(data.id))
      localStorage.setItem(`trivia_nickname_${gameId}`, cleanName)
      fetchGameState()
    }
  }

  const handleAnswerSubmit = async (choiceId: string, isCorrect: boolean) => {
    if (hasSubmitted || !participantId || !question) return

    setHasSubmitted(true)
    setSelectedChoice(choiceId)

    const scoreVal = isCorrect ? 100 : 0

    await supabase
      .from('answers')
      .insert([{
        participant_id: participantId,
        question_id: question.id,
        choice_id: choiceId,
        score: scoreVal
      }])
  }

  // --- 5. UI RENDERERS ---

  if (phase === 'join' || !participantId) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 to-pink-900/40 z-0"></div>
        <div className="z-10 w-full max-w-sm bg-black/50 backdrop-blur-lg p-8 rounded-3xl border border-gray-700 shadow-2xl text-center">
          <span className="text-xs font-black text-blue-400 tracking-widest uppercase block mb-2">Staff Trivia Arena</span>
          <h1 className="text-3xl font-black uppercase tracking-tight mb-8">Join the Game</h1>
          
          <form onSubmit={handleJoinGame} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Enter your Nickname..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-gray-800 border-2 border-gray-600 rounded-xl px-5 py-4 text-lg font-bold text-center text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors uppercase"
              maxLength={15}
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xl py-4 rounded-xl uppercase tracking-wider shadow-lg transition-transform active:scale-95"
            >
              Lock In 🚀
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (phase === 'lobby') {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-gradient-to-br from-pink-500/20 to-purple-600/20 p-8 rounded-3xl border border-pink-500/30 animate-pulse">
          <h2 className="text-3xl font-black uppercase mb-2">You&apos;re In!</h2>
          <p className="text-gray-300 font-bold text-lg">Look up at the projector.</p>
          <p className="text-pink-400 text-sm mt-6 font-medium italic">&quot;Are you ready for it?&quot;</p>
        </div>
      </main>
    )
  }

  if (phase === 'quiz') {
    const choiceColors = ['bg-red-600', 'bg-blue-600', 'bg-yellow-500', 'bg-green-600']

    return (
      <main className="min-h-screen bg-gray-900 text-white flex flex-col p-4">
        {/* Top Identification Bar */}
        <div className="bg-gray-800 rounded-2xl p-3 mb-3 text-center border border-gray-700 shadow-sm flex justify-between items-center px-6">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Playing As</span>
          <span className="text-lg font-black text-white uppercase">{nickname}</span>
        </div>

        {/* RESTORED: Question prompt box on the phone layout */}
        {question && (
          <div className="bg-black/40 backdrop-blur-sm border border-gray-700 rounded-2xl p-5 mb-4 text-center shadow-lg">
            <span className="text-xs font-bold text-pink-400 uppercase tracking-widest block mb-1">Current Trivia Task</span>
            <h2 className="text-xl font-bold leading-snug">{question.body}</h2>
          </div>
        )}

        <div className="flex-grow flex flex-col justify-center gap-3">
          {!hasSubmitted && !selectedChoice ? (
            choices.map((choice, index) => (
              <button
                key={choice.id}
                onClick={() => handleAnswerSubmit(choice.id, choice.is_correct)}
                className={`w-full ${choiceColors[index % 4]} text-white font-black text-xl py-6 px-4 rounded-2xl shadow-xl active:scale-95 transition-transform border-b-4 border-black/30`}
              >
                {choice.body}
              </button>
            ))
          ) : (
            <div className="text-center py-16 bg-gray-800 rounded-3xl border border-gray-700 shadow-inner animate-pulse">
              <span className="text-6xl mb-4 block">⏳</span>
              <h2 className="text-2xl font-black uppercase text-pink-400">Answer Secured!</h2>
              <p className="text-gray-400 mt-2 font-bold">Hold tight for the host timer...</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (phase === 'show_results') {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 text-center">
         <span className="text-6xl mb-4 block">👀</span>
         <h2 className="text-3xl font-black uppercase text-white mb-2">Check the Screen!</h2>
         <p className="text-gray-400 font-bold">Did you get it right?</p>
      </main>
    )
  }

  if (phase === 'result') {
    return (
      <main className="min-h-screen bg-purple-900 text-white flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
        <div className="z-10 bg-black/40 p-10 rounded-3xl backdrop-blur-sm border border-purple-500/30">
          <span className="text-6xl mb-4 block animate-bounce">👑</span>
          <h1 className="text-4xl font-black uppercase tracking-tight text-pink-300 mb-2">
            Game Over!
          </h1>
          <p className="text-xl font-bold text-gray-200">Look at the projector to see the Grand Champion!</p>
        </div>
      </main>
    )
  }

  return null
}
