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
  
  const [answeredUserIds, setAnsweredUserIds] = useState<string[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)

  const [isIntroducing, setIsIntroducing] = useState(true)
  const [introCountdown, setIntroCountdown] = useState(4)

  // 1. Initial setup on question advance
  useEffect(() => {
    if (questions && questions[currentSequence]) {
      const sortedQuestions = [...questions].sort((a: any, b: any) => a.order - b.order)
      const q = sortedQuestions[currentSequence]
      setActiveQuestion(q)
      setChoices(q.choices || [])
      setTimeLeft(30)
      setShowResults(false)
      setAnsweredUserIds([])
      
      setIsIntroducing(true)
      setIntroCountdown(4)

      // Dynamically count the current baseline pool registered for this room right now
      const syncCurrentLobbyTotal = async () => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', gameId)
        setTotalPlayers(count || 0)
      }
      syncCurrentLobbyTotal()
    }
  }, [currentSequence, questions, gameId])

  // 2. 4-Second Intro Delay Clock
  useEffect(() => {
    if (!isIntroducing) return

    if (introCountdown <= 0) {
      setIsIntroducing(false)
      return
    }

    const introTimer = setTimeout(() => {
      setIntroCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearTimeout(introTimer)
  }, [introCountdown, isIntroducing])

  // 3. Clean Live Sync Engine
  useEffect(() => {
    if (!activeQuestion || isIntroducing) return

    const syncActiveAnswers = async () => {
      const { data: activePlayers } = await supabase
        .from('participants')
        .select('id')
        .eq('game_id', gameId)

      if (!activePlayers || activePlayers.length === 0) {
        setAnsweredUserIds([])
        return
      }

      const activePlayerIds = activePlayers.map((p: any) => String(p.id))

      const { data: currentAnswers } = await supabase
        .from('answers')
        .select('participant_id')
        .eq('question_id', activeQuestion.id)
        .in('participant_id', activePlayerIds)
      
      if (currentAnswers) {
        const uniqueIds = Array.from(new Set(currentAnswers.map((ans: any) => String(ans.participant_id))))
        setAnsweredUserIds(uniqueIds)
      }
    }
    
    syncActiveAnswers()

    const channel = supabase
      .channel(`room_track_${activeQuestion.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `question_id=eq.${activeQuestion.id}` },
        async (payload) => {
          if (payload.new && payload.new.participant_id) {
            const incomingUserId = String(payload.new.participant_id)
            
            const { data: checkPlayer } = await supabase
              .from('participants')
              .select('id')
              .eq('id', incomingUserId)
              .eq('game_id', gameId)
              .single()

            if (checkPlayer) {
              setAnsweredUserIds((prev) => {
                if (prev.includes(incomingUserId)) return prev
                return [...prev, incomingUserId]
              })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeQuestion, gameId, isIntroducing])

  // 4. Master Countdown Broadcast Loop
  useEffect(() => {
    if (isIntroducing) return
    
    if (timeLeft <= 0) {
      setShowResults(true)
      // Lockout state change broadcasted directly to database matrix
      supabase
        .from('games')
        .update({ phase: 'show_results', dynamic_time_left: 0 } as any)
        .eq('id', gameId)
        .then()
      return
    }

    const timer = setTimeout(async () => {
      const nextTime = timeLeft - 1
      setTimeLeft(nextTime)

      await supabase
        .from('games')
        .update({ dynamic_time_left: nextTime, dynamic_is_introducing: false } as any)
        .eq('id', gameId)

    }, 1000)

    return () => clearTimeout(timer)
  }, [timeLeft, isIntroducing, gameId])

  useEffect(() => {
    if (isIntroducing && gameId) {
      supabase
        .from('games')
        .update({ dynamic_is_introducing: true, dynamic_time_left: 30 } as any)
        .eq('id', gameId)
        .then()
    }
  }, [isIntroducing, gameId])

  const handleNextQuestion = async () => {
    const nextIndex = currentSequence + 1
    if (nextIndex >= questions.length) {
      await supabase.from('games').update({ phase: 'result' }).eq('id', gameId)
    } else {
      await supabase.from('games').update({ current_question_sequence: nextIndex, phase: 'quiz' }).eq('id', gameId)
    }
  }

  if (!activeQuestion) return <div className="text-white text-center p-12">Loading quiz contents...</div>

  return (
    <main className="bg-gray-900 min-h-screen text-white font-sans flex flex-col justify-between p-8 select-none relative overflow-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes jello-grow {
          0% { transform: scale(1); }
          30% { transform: scale(1.12) skewX(-10deg) skewY(-10deg); }
          40% { transform: scale(1.08) skewX(7deg) skewY(7deg); }
          50% { transform: scale(1.1) skewX(-5deg) skewY(-5deg); }
          65% { transform: scale(1.09) skewX(2deg) skewY(2deg); }
          75% { transform: scale(1.1) skewX(-1deg) skewY(-1deg); }
          100% { transform: scale(1.1) skewX(0) skewY(0); }
        }
        .jello-reveal {
          animation: jello-grow 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
          z-index: 40;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }
      `}} />

      <div className="flex justify-between items-center bg-black/40 border border-gray-800 rounded-2xl p-4 shadow-xl">
        <div>
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest block">Wallace Stegner Academy</span>
          <h1 className="text-xl font-black uppercase tracking-tight">Question {currentSequence + 1} of {questions.length}</h1>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="bg-gray-800 px-4 py-2 rounded-xl text-center border border-gray-700">
            <span className="text-[10px] uppercase font-black text-gray-400 block tracking-wider">Responses</span>
            {/* FRACTION DISPLAY ACCURATE MATCH ON HOST SCREEN */}
            <span className="text-lg font-black text-green-400">
              {answeredUserIds.length} / {totalPlayers || '---'}
            </span>
          </div>
          
          <div className={`px-5 py-2 rounded-xl font-black text-lg border transition-all ${isIntroducing ? 'bg-blue-600 border-blue-400 text-white animate-pulse' : timeLeft <= 5 ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-black/30 border-gray-700 text-white'}`}>
            {isIntroducing ? `Ready: ${introCountdown}s` : `⏱️ ${timeLeft}s`}
          </div>
        </div>
      </div>

      <div className="my-auto max-w-4xl w-full mx-auto text-center py-6">
        <h2 className="text-4xl font-extrabold tracking-tight text-white mb-12 leading-snug">
          {activeQuestion.body}
        </h2>

        {isIntroducing ? (
          <div className="bg-blue-600/20 border border-blue-500/40 text-blue-400 font-black text-xl py-4 px-10 rounded-2xl inline-block tracking-widest uppercase mb-6 shadow-xl animate-pulse">
            👀 Read the Question! Choices dropping in {introCountdown}s...
          </div>
        ) : showResults ? (
          <div className="bg-green-500/20 text-green-400 border border-green-500/30 font-black text-md py-3 px-6 rounded-xl inline-block mb-6 uppercase tracking-wider scale-110 transition-transform duration-300">
            🎉 Round Over! Revealing Answer...
          </div>
        ) : (
          <div className="h-14"></div>
        )}

        <div className={`grid grid-cols-2 gap-6 text-left transition-all duration-700 ${isIntroducing ? 'opacity-25 blur-md pointer-events-none scale-95' : 'opacity-100 blur-0 scale-100'}`}>
          {choices.map((choice, idx) => {
            const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']
            const isCorrect = choice.is_correct
            const resultStyles = showResults 
              ? isCorrect 
                ? 'jello-reveal ring-4 ring-white border-transparent scale-110 z-10' 
                : 'opacity-15 blur-[2px] scale-95 pointer-events-none'
              : 'hover:scale-[1.02] border-b-4 border-black/20'

            return (
              <div
                key={choice.id}
                className={`${gridColors[idx % 4]} p-6 rounded-2xl shadow-lg flex items-center justify-between min-h-[100px] transition-all duration-500 transform-gpu ${resultStyles}`}
              >
                <span className="text-2xl font-black uppercase tracking-wide">{choice.body}</span>
                {showResults && isCorrect && (
                  <span className="bg-white text-gray-900 rounded-full h-10 w-10 flex items-center justify-center text-xl font-black shadow-2xl ring-4 ring-green-400 animate-bounce">
                    ✓
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          disabled={isIntroducing}
          onClick={handleNextQuestion}
          className={`font-black text-xl py-4 px-12 rounded-xl shadow-md uppercase tracking-wider border-b-4 transition-all ${isIntroducing ? 'bg-gray-800 border-gray-900 text-gray-600 cursor-not-allowed opacity-50' : 'bg-blue-600 border-blue-800 hover:bg-blue-500 text-white'}`}
        >
          {currentSequence + 1 === questions.length ? 'Finish Game 🏁' : 'Next Question ➡️'}
        </button>
      </div>

    </main>
  )
}
