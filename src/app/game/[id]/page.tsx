'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/types/types'

export default function GamePlayerParamPage({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const [nickname, setNickname] = useState('')
  const [joined, setJoined] = useState(false)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState('lobby')
  const [currentSequence, setCurrentSequence] = useState(0)
  const [choices, setChoices] = useState<any[]>([])
  const [hasAnswered, setHasAnswered] = useState(false)

  // Fetch initial game details and register player
  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    const { data: targetGame } = await supabase
      .from('games')
      .select('id, phase, quiz_set_id, current_question_sequence')
      .eq('id', gameId)
      .single()

    if (!targetGame) {
      alert('Active game room not found!')
      return
    }

    setGamePhase(targetGame.phase)
    setCurrentSequence(targetGame.current_question_sequence)

    const { data: player, error } = await supabase
      .from('participants')
      .insert({
        nickname: nickname.trim(),
        game_id: gameId,
        score: 0,
      })
      .select()
      .single()

    if (error) {
      alert('Error joining room: ' + error.message)
      return
    }

    setParticipantId(player.id)
    setJoined(true)
    fetchQuestionChoices(targetGame.quiz_set_id, targetGame.current_question_sequence)
  }

  const fetchQuestionChoices = async (quizSetId: string, sequence: number) => {
    const { data: quizData } = await supabase
      .from('quiz_sets')
      .select(`questions(*, choices(*))`)
      .eq('id', quizSetId)
      .single()

    if (quizData && quizData.questions && quizData.questions[sequence]) {
      setChoices(quizData.questions[sequence].choices || [])
    }
  }

  // Sync player state with host screen real-time controls
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel('param_player_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: any) => {
          const updated = payload.new
          setGamePhase(updated.phase)
          setCurrentSequence(updated.current_question_sequence)
          setHasAnswered(false)
          fetchQuestionChoices(updated.quiz_set_id, updated.current_question_sequence)
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

    if (choice.is_correct) {
      const { data: p } = await supabase
        .from('participants')
        .select('score')
        .eq('id', participantId)
        .single()
      
     await supabase
  .from('participants')
  .update({ score: ((p as any)?.score || 0) + 100 } as any)
  .eq('id', participantId)
    }

    await supabase.from('answers').insert({
      participant_id: participantId,
      question_id: choice.question_id,
      choice_id: choice.id,
    })
  }

  const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']

  // PHASE 1: REGISTRATION LOBBY WITH LOGO
  if (!joined) {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 m-0 p-0 box-border text-white">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-6 shadow-2xl text-center">
          <img 
            src="https://wsacharter.org/wp-content/uploads/2023/11/logo.png" 
            alt="Wallace Stegner Academy Logo"
            className="h-16 mx-auto mb-4 object-contain"
          />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-6">Staff Trivia</p>
          
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

  // PHASE 2: WAITING LOBBY
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

  // PHASE 3: PLAYER CONTROLLER (THE SYMMETRICAL BOX SYSTEM)
  if (gamePhase === 'quiz') {
    return (
      <main className="bg-gray-100 min-h-screen w-full flex flex-col m-0 p-0 box-border text-gray-900">
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black tracking-tight text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold uppercase">
            Question {currentSequence + 1}
          </div>
        </div>

        <div className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center items-center box-border">
          {!hasAnswered ? (
            <div className="w-full h-full flex flex-col justify-between gap-3 box-border">
              {choices.map((choice, idx) => (
                <button
                  key={choice.id}
                  onClick={() => handleSelectChoice(choice)}
                  className={`w-full flex-1 min-h-[75px] ${gridColors[idx % 4]} text-white text-xl font-black rounded-2xl shadow-md transition-transform active:scale-95 flex items-center justify-center px-4 text-center uppercase tracking-wide border-b-4 border-black/20`}
                >
                  {choice.body}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-6 rounded-2xl shadow-xl border border-gray-100 w-full box-border">
              <div className="inline-block p-3 bg-blue-50 text-[#1e3a8a] rounded-full mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-[#1e3a8a] uppercase tracking-tight">Answer Locked In!</h3>
              <p className="text-sm text-gray-400 mt-1 font-medium">Watch the screen for results.</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  // PHASE 4: FINAL RESULTS DISPLAY
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
