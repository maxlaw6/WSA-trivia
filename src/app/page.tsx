'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/types/types'

export default function SafePlayerPage() {
  const [nickname, setNickname] = useState('')
  const [joined, setJoined] = useState(false)
  const [gameId, setGameId] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState('lobby')
  const [currentSequence, setCurrentSequence] = useState(0)
  
  // Question text and timer states
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const [timeLeft, setTimeLeft] = useState(30)
  const [choices, setChoices] = useState<any[]>([])
  const [hasAnswered, setHasAnswered] = useState(false)

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    const { data: activeGames } = await supabase
      .from('games')
      .select('id, phase, quiz_set_id, current_question_sequence')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!activeGames || activeGames.length === 0) {
      alert('No active rooms found. Make sure the host has launched a game!')
      return
    }

    const TargetGame = activeGames[0]
    setGameId(TargetGame.id)
    setGamePhase(TargetGame.phase)
    setCurrentSequence(TargetGame.current_question_sequence)

    const { data: player, error } = await supabase
      .from('participants')
      .insert({
        nickname: nickname.trim(),
        game_id: TargetGame.id
      } as any)
      .select()
      .single()

    if (error) {
      alert('Join Error: ' + error.message)
      return
    }

    setParticipantId(player.id)
    setJoined(true)
    fetchQuestionDetails(TargetGame.quiz_set_id, TargetGame.current_question_sequence)
  }

  const fetchQuestionDetails = async (quizSetId: string, sequence: number) => {
    const { data: quizData } = await supabase
      .from('quiz_sets')
      .select(`questions(*, choices(*))`)
      .eq('id', quizSetId)
      .single()

    if (quizData && quizData.questions && quizData.questions[sequence]) {
      const activeQuestion = quizData.questions[sequence]
      setCurrentQuestionText(activeQuestion.body || 'Get Ready...')
      setChoices(activeQuestion.choices || [])
      // Reset local timer guess to standard 30 seconds when question shifts
      setTimeLeft(30)
    }
  }

  // Countdown timer clock loop
  useEffect(() => {
    if (gamePhase !== 'quiz' || hasAnswered) return
    
    const clock = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(clock)
          return 0;
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(clock)
  }, [gamePhase, currentSequence, hasAnswered])

  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel('safe_player_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: any) => {
          const updated = payload.new
          setGamePhase(updated.phase)
          setCurrentSequence(updated.current_question_sequence)
          setHasAnswered(false)
          fetchQuestionDetails(updated.quiz_set_id, updated.current_question_sequence)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const handleSelectChoice = async (choice: any) => {
    if (hasAnswered || !participantId) return
    setHasAnswered(true)

    try {
      await supabase
        .from('participants')
        .update({ score: 100 } as any)
        .eq('id', participantId)
    } catch (e) {
      console.log('Handled schema bypass smoothly')
    }

    await supabase.from('answers').insert({
      participant_id: participantId,
      question_id: choice.question_id,
      choice_id: choice.id,
    } as any)
  }

  const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']

  if (!joined) {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 m-0 p-0 text-white">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-8 shadow-2xl text-center border border-gray-100">
          <div className="mb-4">
            <span className="text-3xl font-black block tracking-tight text-[#1e3a8a] uppercase leading-none">WSA</span>
            <span className="text-xs font-bold tracking-widest text-gray-400 block uppercase mt-1">Wallace Stegner Academy</span>
          </div>
          <div className="h-0.5 w-12 bg-blue-500 mx-auto mb-6 rounded"></div>
          
          <form onSubmit={handleJoinGame} className="space-y-4">
            <input
              type="text"
              maxLength={12}
              placeholder="YOUR NICKNAME"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-lg font-black tracking-wide uppercase focus:border-[#1e3a8a] focus:outline-none"
              required
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-[#1e3a8a] text-white font-black text-lg py-4 rounded-xl transition-all uppercase tracking-wider shadow-md"
            >
              Enter Game
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (gamePhase === 'lobby') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-6 text-center text-white">
        <div className="bg-white/10 p-5 rounded-full mb-4 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight">You&apos;re Registered!</h2>
        <p className="text-md text-blue-200 mt-1">Nickname: <span className="font-extrabold text-white bg-white/20 px-2.5 py-0.5 rounded-md">{nickname}</span></p>
        <div className="mt-8 bg-white text-gray-900 px-6 py-4 rounded-xl shadow-xl w-full max-w-xs">
          <p className="text-sm font-extrabold text-[#1e3a8a] animate-bounce">Waiting for Host to begin...</p>
        </div>
      </main>
    )
  }

  if (gamePhase === 'quiz') {
    return (
      <main className="bg-gray-100 min-h-screen w-full flex flex-col m-0 p-0 text-gray-900">
        {/* Header with Title and Question Track */}
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black tracking-tight text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold uppercase">
            Question {currentSequence + 1}
          </div>
        </div>

        {/* Streaming Question Text Card & Timer Display */}
        <div className="w-full max-w-md mx-auto px-4 pt-4 shrink-0">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-1000" style={{ width: `${(timeLeft / 30) * 100}%` }}></div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Question</p>
            <h2 className="text-lg font-extrabold text-gray-800 leading-snug px-2 mb-2">
              {currentQuestionText}
            </h2>
            <div className="inline-block bg-red-50 text-red-600 px-3 py-0.5 rounded-full text-xs font-black tracking-tight">
              ⏱️ {timeLeft}s Left
            </div>
          </div>
        </div>

        {/* Controller Grid Buttons */}
        <div className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center items-center">
          {!hasAnswered ? (
            <div className="w-full h-full flex flex-col justify-between gap-2.5">
              {choices.map((choice, idx) => (
                <button
                  key={choice.id}
                  onClick={() => handleSelectChoice(choice)}
                  className={`w-full flex-1 min-h-[68px] ${gridColors[idx % 4]} text-white text-lg font-black rounded-xl shadow-md flex items-center justify-center px-4 text-center uppercase tracking-wide border-b-4 border-black/20`}
                >
                  {choice.body}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-6 rounded-2xl shadow-xl border border-gray-100 w-full">
              <div className="inline-block p-3 bg-blue-50 text-[#1e3a8a] rounded-full mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-[#1e3a8a] uppercase tracking-tight">Answer Locked In!</h3>
              <p className="text-sm text-gray-400 mt-1 font-medium">Watch the main screen for details.</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (gamePhase === 'result') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 text-white text-center">
        <div className="bg-white text-gray-900 rounded-3xl p-6 shadow-2xl max-w-xs w-full">
          <div className="text-3xl mb-1">🏁</div>
          <h2 className="text-2xl font-black tracking-tight text-[#1e3a8a] uppercase">Quiz Finished!</h2>
          <div className="my-4 py-4 px-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Player Badge</span>
            <span className="text-xl font-black text-gray-800 tracking-wide uppercase block mt-0.5">{nickname}</span>
          </div>
          <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest pt-2 border-t border-gray-100">
            Wallace Stegner Academy
          </div>
        </div>
      </main>
    )
  }

  return null
}
