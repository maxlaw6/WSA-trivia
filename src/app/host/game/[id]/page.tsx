'use client'

import {
  Game,
  Participant,
  QuizSet,
  supabase,
} from '@/types/types'
import { useEffect, useState } from 'react'
import Lobby from './lobby'
import Quiz from './quiz'
import Results from './results'

enum AdminScreens {
  lobby = 'lobby',
  quiz = 'quiz',
  result = 'result',
}

export default function Home({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const [currentScreen, setCurrentScreen] = useState<AdminScreens>(
    AdminScreens.lobby
  )

  const [participants, setParticipants] = useState<Participant[]>([])
  const [quizSet, setQuizSet] = useState<QuizSet>()
  const [currentQuestionSequence, setCurrentQuestionSequence] = useState(0)

  useEffect(() => {
    const getQuestions = async () => {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('id', gameId)
        .single()
      if (gameError) {
        console.error(gameError.message)
        alert('Error getting game data')
        return
      }
      const { data, error } = await supabase
        .from('quiz_sets')
        .select(`*, questions(*, choices(*))`)
        .eq('id', gameData.quiz_set_id)
        .order('order', {
          ascending: true,
          referencedTable: 'questions',
        })
        .single()
      if (error) {
        console.error(error.message)
        getQuestions()
        return
      }
      setQuizSet(data)
    }

    const setGameListner = async () => {
      const { data } = await supabase
        .from('participants')
        .select()
        .eq('game_id', gameId)
        .order('created_at')
      if (data) setParticipants(data)

      supabase
        .channel('game')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'participants',
            filter: `game_id=eq.${gameId}`,
          },
          (payload) => {
            setParticipants((currentParticipants) => {
              return [...currentParticipants, payload.new as Participant]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
          },
          (payload) => {
            const game = payload.new as Game
            setCurrentScreen(game.phase as AdminScreens)
            
            if (game.phase === 'quiz') {
              setCurrentQuestionSequence(game.current_question_sequence)
            }
          }
        )
        .subscribe()

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('id', gameId)
        .single()

      if (gameError) {
        alert(gameError.message)
        console.error(gameError)
        return
      }

      setCurrentQuestionSequence(gameData.current_question_sequence)
      setCurrentScreen(gameData.phase as AdminScreens)
    }

    getQuestions()
    setGameListner()

    return () => {
      supabase.removeAllChannels()
    }
  }, [gameId])

  return (
    <main className="bg-gray-900 min-h-screen">
      {currentScreen === AdminScreens.lobby && (
        <Lobby participants={participants} gameId={gameId} />
      )}
     {currentScreen === AdminScreens.quiz && quizSet?.questions && (
        <Quiz
          key={`quiz_seq_${currentQuestionSequence}`}
          questions={quizSet.questions}
          currentSequence={currentQuestionSequence}
          gameId={gameId}
        />
      )}
      {currentScreen === AdminScreens.result && (
        <Results
          participants={participants}
          quizSet={quizSet!}
          gameId={gameId}
        />
      )}
    </main>
  )
}
