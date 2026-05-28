'use client'

import { Choice, Question, supabase } from '@/types/types'
import { useEffect, useState } from 'react'

export default function HostQuizView({
  questions,
  currentSequence,
  gameId,
}: {
  questions: Question[]
  currentSequence: number
  gameId: string
}) {
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [timeLeft, setTimeLeft] = useState(30)
  const [showResults, setShowResults] = useState(false)
  
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [answersCount, setAnswersCount] = useState(0)

  // 1. Initial setup for the active question
  useEffect(() => {
    if (questions && questions[currentSequence]) {
      const sortedQuestions = [...questions].sort((a: any, b: any) => a.order - b.order)
      const q = sortedQuestions[currentSequence]
      setActiveQuestion(q)
      setChoices(q.choices || [])
      setTimeLeft(30)
      setShowResults(false)
      setAnswersCount(0)

      // Get total players currently registered in THIS live game session
      const fetchTotalPlayers = async () => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', gameId)
        setTotalPlayers(count || 0)
      }
      fetchTotalPlayers()
    }
  }, [currentSequence, questions, gameId])

  // 2. SESSION-ISOLATED POLLING ENGINE
  useEffect(() => {
    if (!activeQuestion) return

    const checkAnswersDirectly = async () => {
      // First, fetch the IDs of players belonging strictly to this active game
      const { data: activePlayers } = await supabase
        .from('participants')
        .select('id')
        .eq('game_id', gameId)

      if (!activePlayers || activePlayers.length === 0) {
        setAnswersCount(0)
        return
      }

      const playerIds = activePlayers.map(p => p.id)

      // Only count answers matching this question AND submitted by active session players
      const { count } = await supabase
        .from('answers')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', activeQuestion.id)
        .in('participant_id', playerIds)
      
      setAnswersCount(count || 0)
    }

    checkAnswersDirectly()
    const intervalId = setInterval(checkAnswersDirectly, 1500)

    return () => clearInterval(intervalId)
  }, [activeQuestion, gameId])

  // 3. Central Pacing Loop
  useEffect(() => {
    if (timeLeft <= 0) {
      setShowResults(true)
      return
    }

    if (totalPlayers > 0 && answersCount >= totalPlayers) {
      setTimeLeft(0)
      setShowResults(true)
      return
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [timeLeft, answersCount, totalPlayers])

  const handleNextQuestion = async () => {
    const nextIndex = currentSequence + 1
    
    if (nextIndex >= questions.length) {
      await supabase.from('games').update({ phase: 'result' }).eq('id', gameId)
    } else {
      await supabase.from('games').update({ current_question_sequence: nextIndex }).eq('id', gameId)
    }
  }

  if (!activeQuestion) return <div className="text-white text-center p-12">Loading quiz contents...</div>

  return (
    <main className="bg-gray-900 min-h-screen text-white font-sans flex flex-col justify-between p-8">
      
      <div className="flex justify-between items-center bg-black/40 border border-gray-800 rounded-2xl p-4 shadow-xl">
        <div>
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest block">Wallace Stegner Academy</span>
          <h1 className="text-xl font-black uppercase tracking-tight">Question {currentSequence + 1} of {questions.length}</h1>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="bg-gray-800 px-4 py-2 rounded-xl text-center border border-gray-700">
            <span className="text-[10px] uppercase font-black text-gray-400 block tracking-wider">Responses</span>
            <span className="text-lg font-black text-green-400">{answersCount} / {totalPlayers || '---'}</span>
          </div>
          
          <div className={`px-5 py-2 rounded-xl font-black text-lg border transition-colors ${timeLeft <= 5 ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-black/30 border-gray-700 text-white'}`}>
            ⏱️ {timeLeft}s
          </div>
        </div>
      </div>

      <div className="my-auto max-w-4xl w-full mx-auto text-center py-6">
        <h2 className="text-4xl font-extrabold tracking-tight text-white mb-12">
          {activeQuestion.body}
        </h2>

        {showResults && (
          <div className="bg-blue-500/20 text-blue-400 font-black text-md py-3 px-6 rounded-xl inline-block mb-6 uppercase tracking-wider border border-blue-500/30">
            ⏰ Time Up! Showing Correct Answer
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-left">
          {choices.map((choice, idx) => {
            const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']
            return (
              <div
                key={choice.id}
                className={`${gridColors[idx % 4]} p-5 rounded-2xl shadow-lg border-b-4 border-black/20 flex items-center justify-between min-h-[90px]`}
              >
                <span className="text-xl font-black uppercase tracking-wide">{choice.body}</span>
                {showResults && choice.is_correct && (
                  <span className="bg-white text-gray-900 rounded-full h-8 w-8 flex items-center justify-center text-md font-black shadow-md">✓</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={handleNextQuestion}
          className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xl py-4 px-12 rounded-xl shadow-md uppercase tracking-wider border-b-4 border-blue-800"
        >
          {currentSequence + 1 === questions.length ? 'Finish Game 🏁' : 'Next Question ➡️'}
        </button>
      </div>

    </main>
  )
}
