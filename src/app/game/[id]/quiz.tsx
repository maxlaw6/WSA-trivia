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
  
  // High-capacity player tracking states
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [answersCount, setAnswersCount] = useState(0)

  // 1. Load question data and count active room connections
  useEffect(() => {
    if (questions && questions[currentSequence]) {
      const sortedQuestions = [...questions].sort((a: any, b: any) => a.order - b.order)
      const q = sortedQuestions[currentSequence]
      setActiveQuestion(q)
      setChoices(q.choices || [])
      setTimeLeft(30)
      setShowResults(false)
      setAnswersCount(0)

      // Fetch how many players successfully made it into the room lobby
      const initialFetch = async () => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', gameId)
        
        setTotalPlayers(count || 0)
      }
      initialFetch()
    }
  }, [currentSequence, questions, gameId])

  // 2. Real-time answer tracking engine
  useEffect(() => {
    if (!activeQuestion) return

    // Listen for incoming answers submitted by teachers' phones
    const answerChannel = supabase
      .channel('host_answer_counter')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `question_id=eq.${activeQuestion.id}` },
        () => {
          setAnswersCount((prev) => prev + 1)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(answerChannel)
    }
  }, [activeQuestion])

  // 3. Centralized Pacing Clock Link
  useEffect(() => {
    if (timeLeft <= 0) {
      setShowResults(true)
      return
    }

    // Force the timer to instantly stop if everyone in the room has answered
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

  // 4. Manual Advance Logic Override
  const handleNextQuestion = async () => {
    const nextIndex = currentSequence + 1
    
    if (nextIndex >= questions.length) {
      // Transition out to final leaderboards if question 24 finishes
      await supabase
        .from('games')
        .update({ phase: 'result' })
        .eq('id', gameId)
    } else {
      // Advance row sequence index safely
      await supabase
        .from('games')
        .update({ current_question_sequence: nextIndex })
        .eq('id', gameId)
    }
  }

  if (!activeQuestion) return <div className="text-white text-center p-12">Loading quiz contents...</div>

  return (
    <main className="bg-gray-900 min-h-screen text-white font-sans flex flex-col justify-between p-8">
      
      {/* Top Dash Status Bar */}
      <div className="flex justify-between items-center bg-black/40 border border-gray-800 rounded-2xl p-4 shadow-xl">
        <div>
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest block">Wallace Stegner Academy</span>
          <h1 className="text-xl font-black uppercase tracking-tight">Question {currentSequence + 1} of {questions.length}</h1>
        </div>
        
        {/* Dynamic Sync Status Notifications */}
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

      {/* Main Core Question Visualizer */}
      <div className="my-auto max-w-4xl w-full mx-auto text-center py-6">
        <h2 className="text-4xl font-extrabold tracking-tight leading-snug text-white drop-shadow-md mb-12">
          {activeQuestion.body}
        </h2>

        {/* Live Status Prompts */}
        {answersCount >= totalPlayers && totalPlayers > 0 && !showResults && (
          <div className="bg-green-500 text-black font-black text-md py-3 px-6 rounded-xl inline-block animate-bounce mb-6 uppercase tracking-wider">
            🎉 Everyone Has Answered! 
          </div>
        )}

        {/* The 4-choice response box layout matrix */}
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
                  <span className="bg-white text-gray-900 rounded-full h-8 w-8 flex items-center justify-center text-md shadow-md">✓</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom Interface Bar */}
      <div className="flex justify-end pt-4 border-t border-gray-800">
        {(showResults || (answersCount >= totalPlayers && totalPlayers > 0) || answersCount > 0) ? (
          <button
            onClick={handleNextQuestion}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xl py-4 px-12 rounded-xl transition-transform active:scale-95 shadow-md uppercase tracking-wider border-b-4 border-blue-800"
          >
            {currentSequence + 1 === questions.length ? 'Finish Game 🏁' : 'Next Question ➡️'}
          </button>
        ) : (
          <div className="text-sm font-bold text-gray-500 uppercase tracking-widest self-center">
            Waiting for submissions...
          </div>
        )}
      </div>

    </main>
  )
}
