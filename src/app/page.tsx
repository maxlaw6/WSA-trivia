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
      // Sort questions strictly by their order matching the host's logic
      const sortedQuestions = [...quizData.questions].sort((a: any, b: any) => a.order - b.order)
      const activeQuestion = sortedQuestions[sequence]
      
      if (activeQuestion) {
        setCurrentQuestionText(activeQuestion.body || 'Get Ready...')
        setChoices(activeQuestion.choices || [])
        setTimeLeft(30)
      }
    }
  }

  useEffect(() => {
    if (gamePhase !== 'quiz' || hasAnswered) return
    const clock = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(clock)
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
          fetchSyncDetails(updated.quiz_set_id, updated.current_question_sequence)
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  const handleSelectChoice = async (choice: any) => {
    if (hasAnswered || !participantId) return
    setHasAnswered(true)
    try {
      await supabase.from('participants').update({ score: 100 } as any).eq('id', participantId)
    } catch (e) {}
    await supabase.from('answers').insert({ participant_id: participantId, question_id: choice.question_id, choice_id: choice.id } as any)
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
      <main className="bg-gray-100 min-h-screen w-full flex flex-col text-gray-900">
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold">Q: {currentSequence + 1}</div>
        </div>
        <div className="w-full max-w-md mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <h2 className="text-lg font-extrabold text-gray-800 mb-2">{currentQuestionText}</h2>
            <div className="inline-block bg-red-50 text-red-600 px-3 py-0.5 rounded-full text-xs font-black">⏱️ {timeLeft}s Left</div>
          </div>
        </div>
        <div className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center items-center">
          {!hasAnswered ? (
            <div className="w-full h-full flex flex-col justify-between gap-2.5">
              {choices.map((choice, idx) => (
                <button key={choice.id} onClick={() => handleSelectChoice(choice)} className={`w-full flex-1 min-h-[68px] ${gridColors[idx % 4]} text-white text-lg font-black rounded-xl shadow-md border-b-4 border-black/20`}>
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
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center text-white">
        <h2 className="text-2xl font-black uppercase">Quiz Finished!</h2>
      </main>
    )
  }

  return null
}
