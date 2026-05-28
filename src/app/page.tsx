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
  
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const [choices, setChoices] = useState<any[]>([])
  const [hasAnswered, setHasAnswered] = useState(false)

  // Sync state parameters
  const [isIntroducing, setIsIntroducing] = useState(true)
  const [timeLeft, setTimeLeft] = useState(30)

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

    const TargetGame = activeGames[0]
    setGameId(TargetGame.id)
    setGamePhase(TargetGame.phase)
    setCurrentSequence(TargetGame.current_question_sequence)

    const { data: player, error } = await supabase
      .from('participants')
      .insert({ nickname: nickname.trim(), game_id: TargetGame.id } as any)
      .select().single()

    if (error) return alert(error.message)

    setParticipantId(player.id)
    setJoined(true)
    fetchSyncDetails(TargetGame.quiz_set_id, TargetGame.current_question_sequence)
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
        
        // Match host state parameters on initialization
        setIsIntroducing(true)
        setTimeLeft(30)
      }
    }
  }

  // Local clock follows the host pacing matrix safely
  useEffect(() => {
    if (gamePhase !== 'quiz' || hasAnswered) return

    // 4-Second Intro Delay mimicking the host screen
    let introTime = 4
    const introClock = setInterval(() => {
      introTime -= 1
      if (introTime <= 0) {
        clearInterval(introClock)
        setIsIntroducing(false)

        // Start the master 30s countdown match
        const mainClock = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearInterval(mainClock)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    }, 1000)

    return () => {
      clearInterval(introClock)
    }
  }, [gamePhase, currentSequence, hasAnswered])

  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel('safe_player_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: any) => {
          const updated = payload.new
          setGamePhase(updated.phase)
          setCurrentSequence(updated.current_question_sequence)
          setHasAnswered(false)
          setIsIntroducing(true)
          fetchSyncDetails(updated.quiz_set_id, updated.current_question_sequence)
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  const handleSelectChoice = async (choice: any) => {
    if (hasAnswered || !participantId || !activeQuestionId || isIntroducing) return
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
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 text-white">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-8 shadow-2xl text-center">
          <div className="mb-4">
            <span className="text-3xl font-black block tracking-tight text-[#1e3a8a] uppercase leading-none">WSA</span>
            <span className="text-xs font-bold tracking-widest text-gray-400 block uppercase mt-1">Wallace Stegner Academy</span>
          </div>
          <form onSubmit={handleJoinGame} className="space-y-4">
            <input type="text" maxLength={12} placeholder="YOUR NICKNAME" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-lg font-black tracking-wide uppercase focus:outline-none" required />
            <button type="submit" className="w-full bg-gray-900 text-white font-black text-lg py-4 rounded-xl uppercase tracking-wider">Enter Game</button>
          </form>
        </div>
      </main>
    )
  }

  if (gamePhase === 'lobby') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center text-white">
        <h2 className="text-2xl font-black uppercase">Registered!</h2>
        <p className="mt-2 font-bold bg-white/20 px-3 py-1 rounded">{nickname}</p>
      </main>
    )
  }

  if (gamePhase === 'quiz') {
    return (
      <main className="bg-gray-100 min-h-screen w-full flex flex-col text-gray-900 select-none">
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold">Q: {currentSequence + 1}</div>
        </div>
        
        <div className="w-full max-w-md mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <h2 className="text-lg font-extrabold text-gray-800 mb-2">{currentQuestionText}</h2>
            <div className={`inline-block px-3 py-0.5 rounded-full text-xs font-black ${isIntroducing ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
              {isIntroducing ? '👀 Previewing...' : `⏱️ ${timeLeft}s Left`}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center items-center">
          {isIntroducing ? (
            <div className="text-center bg-white/80 backdrop-blur p-6 rounded-2xl shadow-md w-full border border-gray-200/50 animate-pulse">
              <span className="text-sm font-black text-[#1e3a8a] uppercase tracking-wider block">Get Ready!</span>
              <span className="text-xs text-gray-400 font-medium mt-1 block">Read the question on the main screen.</span>
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
              <p className="text-xs text-gray-400 font-medium mt-1">Watch the main screen for details.</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (gamePhase === 'result') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center text-white">
        <h2 className="text-2xl font-black uppercase">Quiz Finished!</h2>
      </main>
    )
  }

  return null
}
