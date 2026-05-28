'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/types/types'

export default function RootPlayerPage() {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [joined, setJoined] = useState(false)
  const [gameId, setGameId] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState('lobby')
  const [currentSequence, setCurrentSequence] = useState(0)
  const [choices, setChoices] = useState<any[]>([])
  const [hasAnswered, setHasAnswered] = useState(false)

  // Join the game by PIN or active game search
  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    // Find the active game session
    const { data: activeGames } = await supabase
      .from('games')
      .select('id, phase, quiz_set_id, current_question_sequence')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!activeGames || activeGames.length === 0) {
      alert('No active trivia rooms found. Make sure the host has started a game!')
      return
    }

    const TargetGame = activeGames[0]
    setGameId(TargetGame.id)
    setGamePhase(TargetGame.phase)
    setCurrentSequence(TargetGame.current_question_sequence)

    // Add player to participants
    const { data: player, error } = await supabase
      .from('participants')
      .insert({
        nickname: nickname.trim(),
        game_id: TargetGame.id,
        score: 0,
      })
      .select()
      .single()

    if (error) {
      alert('Error joining: ' + error.message)
      return
    }

    setParticipantId(player.id)
    setJoined(true)
    fetchQuestionChoices(TargetGame.quiz_set_id, TargetGame.current_question_sequence)
  }

  // Fetch choices safely
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

  // Real-time synchronization
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel('root_player_sync')
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
        .update({ score: (p?.score || 0) + 100 })
        .eq('id', participantId)
    }

    await supabase.from('answers').insert({
      participant_id: participantId,
      question_id: choice.question_id,
      choice_id: choice.id,
    })
  }

  const gridColors = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']

  // PANEL 1: REGISTRATION LOBBY
  if (!joined) {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-4 m-0 p-0 box-border text-white">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-6 shadow-2xl text-center">
          <h1 className="text-2xl font-black text-[#1e3a8a] tracking-tight leading-none mb-1">
            Wallace Stegner Academy
          </h1>
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

  // PANEL 2: WAITING LOBBY
  if (gamePhase === 'lobby') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen w-full flex flex-col justify-center items-center px-6 text-center text-white">
        <div className="bg-white/10 p-5 rounded-full mb-4 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight">You're Registered!</h2>
        <p className="text-md text-blue-200 mt-1">Nickname: <span className="font-extrabold text-white bg-white/20 px-2.5 py-0.5 rounded-md">{nickname}</span></p>
        <div className="mt-8 bg-white text-gray-900 px-6 py-4 rounded-xl shadow-xl w-full max-w-xs">
          <p className="text-sm font-extrabold text-[#1e3a8a] animate-bounce">Waiting for Host to begin...</p>
        </div>
      </main>
    )
  }

  // PANEL 3: INTERACTIVE PLAYER CONTROLLER (THE BOX SYSTEM)
  if (gamePhase === 'quiz') {
    return (
      <main className="bg-gray-100 min-h-screen w-full flex flex-col m-0 p-0 box-border text-gray-900">
        {/* Fixed Header */}
        <div className="bg-[#1e3a8a] text-white py-3 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black tracking-tight text-xs uppercase">WSA Staff Trivia</span>
          <div className="bg-white/25 px-2.5 py-1 rounded text-xs font-bold uppercase">
            Question {currentSequence + 1}
          </div>
        </div>

        {/* Symmetry Enforced Action Panel */}
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

  // PANEL 4: SHOW SCORES / GAME OVER
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
}'use client'

import { Answer, Choice, Game, Participant, QuizSet, supabase } from '@/types/types'
import { useEffect, useState } from 'react'

export default function GamePlayerPage({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const [nickname, setNickname] = useState('')
  const [joined, setJoined] = useState(false)
  const [participantId, setParticipantId] = useState<string | null>(null)
  
  const [game, setGame] = useState<Game | null>(null)
  const [quizSet, setQuizSet] = useState<QuizSet | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null)
  const [hasAnswered, setHasAnswered] = useState(false)

  // Fetch initial game data and subscribe to real-time updates
  useEffect(() => {
    const fetchGameData = async () => {
      const { data: gameData } = await supabase
        .from('games')
        .select()
        .eq('id', gameId)
        .single()
      
      if (gameData) {
        setGame(gameData)
        fetchQuizDetails(gameData.quiz_set_id)
      }
    }

    const fetchQuizDetails = async (quizSetId: string) => {
      const { data: quizData } = await supabase
        .from('quiz_sets')
        .select(`*, questions(*, choices(*))`)
        .eq('id', quizSetId)
        .single()
      
      if (quizData) {
        setQuizSet(quizData)
      }
    }

    fetchGameData()

    // Real-time listener for game phase or question shifts
    const gameChannel = supabase
      .channel('player_game_channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updatedGame = payload.new as Game
          setGame(updatedGame)
          // Reset local selection state when a host advances to a new question
          setSelectedChoiceId(null)
          setHasAnswered(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
    }
  }, [gameId])

  // Get choices for the current question index
  useEffect(() => {
    if (game && quizSet && quizSet.questions) {
      const currentQuestion = quizSet.questions[game.current_question_sequence]
      if (currentQuestion && currentQuestion.choices) {
        setChoices(currentQuestion.choices)
      }
    }
  }, [game, quizSet])

  // Handle player joining the lobby
  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    const { data, error } = await supabase
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

    if (data) {
      setParticipantId(data.id)
      setJoined(true)
    }
  }

  // Handle submitting an answer selection
  const handleSelectChoice = async (choiceId: string) => {
    if (hasAnswered || !participantId || !game || !quizSet) return
    
    setSelectedChoiceId(choiceId)
    setHasAnswered(true)

    const currentQuestion = quizSet.questions![game.current_question_sequence]
    const chosenChoice = choices.find((c) => c.id === choiceId)

    if (chosenChoice?.is_correct) {
      // Fetch current score safely
      const { data: currentParticipant } = await supabase
        .from('participants')
        .select('score')
        .eq('id', participantId)
        .single()

      const currentScore = currentParticipant?.score || 0

      // Award 100 points for a correct response
      await supabase
        .from('participants')
        .update({ score: currentScore + 100 })
        .eq('id', participantId)
    }

    // Save answer instance to the database
    await supabase.from('answers').insert({
      participant_id: participantId,
      question_id: currentQuestion.id,
      choice_id: choiceId,
    })
  }

  // Visual helper styles for Kahoot-esque color shapes
  const choiceColors = [
    'bg-red-500 hover:bg-red-600 focus:ring-red-400',
    'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400',
    'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400',
    'bg-green-500 hover:bg-green-600 focus:ring-green-400',
  ]

  // 1. SIGN-IN SCREEN (LOBBY REGISTRATION)
  if (!joined) {
    return (
      <main className="bg-[#1e3a8a] min-h-screen flex flex-col justify-center items-center px-4 font-sans text-white">
        <div className="w-full max-w-md bg-white text-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-100">
          <div className="text-center mb-6">
            <div className="inline-block bg-[#1e3a8a] text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2">
              WSA Trivia Game
            </div>
            <h1 className="text-2xl font-black text-[#1e3a8a] tracking-tight">
              Wallace Stegner Academy
            </h1>
            <p className="text-sm text-gray-500 mt-1">Enter a nickname to join the game</p>
          </div>

          <form onSubmit={handleJoinLobby} className="space-y-4">
            <div>
              <input
                type="text"
                maxLength={15}
                placeholder="Nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl text-center text-lg font-bold tracking-wide uppercase focus:border-[#1e3a8a] focus:outline-none transition-colors"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-[#1e3a8a] text-white font-extrabold text-lg py-4 rounded-xl transition-all shadow-md uppercase tracking-wider"
            >
              Join Lobby
            </button>
          </form>
        </div>
      </main>
    )
  }

  // 2. LOBBY WAITING SCREEN
  if (game?.phase === 'lobby') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen flex flex-col justify-center items-center px-6 text-center text-white font-sans">
        <div className="animate-pulse bg-white/10 p-6 rounded-full mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-black tracking-tight mb-2 uppercase">You're Locked In!</h1>
        <p className="text-lg text-blue-200 font-medium">Nickname: <span className="text-white font-bold bg-white/20 px-3 py-1 rounded-md ml-1">{nickname}</span></p>
        <div className="mt-12 bg-white text-gray-900 px-6 py-4 rounded-xl shadow-xl max-w-xs">
          <p className="text-sm font-bold uppercase text-gray-400 tracking-wider">Status</p>
          <p className="text-md font-extrabold text-[#1e3a8a] mt-0.5 animate-bounce">Waiting for Host to Start...</p>
        </div>
      </main>
    )
  }

  // 3. LIVE QUIZ INTERACTIVE INPUTS
  if (game?.phase === 'quiz') {
    return (
      <main className="bg-gray-50 min-h-screen flex flex-col font-sans text-gray-900">
        {/* School Branding Sticky Banner */}
        <div className="bg-[#1e3a8a] text-white py-3.5 px-4 shadow-md flex justify-between items-center shrink-0">
          <span className="font-black tracking-tight text-sm uppercase">WSA Staff Trivia</span>
          <div className="bg-white/20 px-3 py-1 rounded-md text-xs font-bold tracking-wide uppercase">
            Question {game.current_question_sequence + 1}
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex-1 flex flex-col justify-center px-4 py-6 max-w-md mx-full w-full self-center">
          {!hasAnswered ? (
            <div className="grid grid-cols-1 gap-4 w-full">
              {choices.map((choice, idx) => (
                <button
                  key={choice.id}
                  onClick={() => handleSelectChoice(choice.id)}
                  className={`w-full ${choiceColors[idx % 4]} text-white text-xl font-black py-7 px-6 rounded-2xl shadow-md transition-transform active:scale-95 focus:outline-none focus:ring-4 text-center tracking-wide uppercase min-h-[90px] flex items-center justify-center`}
                >
                  {choice.body}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-8 rounded-2xl shadow-xl border border-gray-100 w-full">
              <div className="inline-block p-4 bg-blue-50 text-[#1e3a8a] rounded-full mb-4 animate-spin-slow">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0112 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-[#1e3a8a] uppercase tracking-tight">Answer Received!</h2>
              <p className="text-gray-500 mt-2 font-medium">Keep your eyes on the main screen to see the results!</p>
              
              <div className="mt-6 pt-6 border-t border-gray-100 flex justify-between items-center text-sm text-gray-400 font-bold uppercase">
                <span>Player: {nickname}</span>
                <span className="text-[#1e3a8a]">WSA Charter</span>
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  // 4. GAME OVER / FINAL RESULTS
  if (game?.phase === 'result') {
    return (
      <main className="bg-[#1e3a8a] min-h-screen flex flex-col justify-center items-center px-6 text-white font-sans text-center">
        <div className="bg-white text-gray-900 rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-gray-100">
          <div className="text-4xl mb-3">🏆</div>
          <h1 className="text-3xl font-black tracking-tight text-[#1e3a8a] uppercase">Game Finished!</h1>
          <p className="text-gray-500 font-medium mt-1">Thank you for playing!</p>
          
          <div className="my-6 py-5 px-4 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Your Final Status</span>
            <span className="text-2xl font-black text-gray-800 tracking-wide uppercase block mt-1">{nickname}</span>
          </div>

          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2 border-t border-gray-100">
            Wallace Stegner Academy
          </div>
        </div>
      </main>
    )
  }

  return null
}'use client'

import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { Choice, Game, Participant, Question, supabase } from '@/types/types'
import Lobby from './lobby'
import Quiz from './quiz'

enum Screens {
  lobby = 'lobby',
  quiz = 'quiz',
  results = 'result',
}

export default function Home({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const onRegisterCompleted = (participant: Participant) => {
    setParticipant(participant)
    getGame()
  }

  const stateRef = useRef<Participant | null>()

  const [participant, setParticipant] = useState<Participant | null>()

  stateRef.current = participant

  const [currentScreen, setCurrentScreen] = useState(Screens.lobby)

  const [questions, setQuestions] = useState<Question[]>()

  const [currentQuestionSequence, setCurrentQuestionSequence] = useState(0)
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false)

  const getGame = async () => {
    const { data: game } = await supabase
      .from('games')
      .select()
      .eq('id', gameId)
      .single()
    if (!game) return
    setCurrentScreen(game.phase as Screens)
    if (game.phase == Screens.quiz) {
      setCurrentQuestionSequence(game.current_question_sequence)
      setIsAnswerRevealed(game.is_answer_revealed)
    }

    getQuestions(game.quiz_set_id)
  }

  const getQuestions = async (quizSetId: string) => {
    const { data, error } = await supabase
      .from('questions')
      .select(`*, choices(*)`)
      .eq('quiz_set_id', quizSetId)
      .order('order', { ascending: true })
    if (error) {
      getQuestions(quizSetId)
      return
    }
    setQuestions(data)
  }

  useEffect(() => {
    const setGameListner = (): RealtimeChannel => {
      return supabase
        .channel('game_participant')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
          },
          (payload) => {
            if (!stateRef.current) return

            // start the quiz game
            const game = payload.new as Game

            if (game.phase == 'result') {
              setCurrentScreen(Screens.results)
            } else {
              setCurrentScreen(Screens.quiz)
              setCurrentQuestionSequence(game.current_question_sequence)
              setIsAnswerRevealed(game.is_answer_revealed)
            }
          }
        )
        .subscribe()
    }

    const gameChannel = setGameListner()
    return () => {
      supabase.removeChannel(gameChannel)
    }
  }, [gameId])

  return (
    <main className="bg-green-500 min-h-screen">
      {currentScreen == Screens.lobby && (
        <Lobby
          onRegisterCompleted={onRegisterCompleted}
          gameId={gameId}
        ></Lobby>
      )}
      {currentScreen == Screens.quiz && questions && (
        <Quiz
          question={questions![currentQuestionSequence]}
          questionCount={questions!.length}
          participantId={participant!.id}
          isAnswerRevealed={isAnswerRevealed}
        ></Quiz>
      )}
      {currentScreen == Screens.results && (
        <Results participant={participant!}></Results>
      )}
    </main>
  )
}

function Results({ participant }: { participant: Participant }) {
  return (
    <div className="flex justify-center items-center min-h-screen text-center">
      <div className="p-8 bg-black text-white rounded-lg">
        <h2 className="text-2xl pb-4">Hey {participant.nickname}！</h2>
        <p>Thanks for playing 🎉</p>
      </div>
    </div>
  )
}
