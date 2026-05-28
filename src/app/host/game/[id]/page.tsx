'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/types/types'
import Quiz from './quiz'

enum AdminScreens {
  lobby,
  quiz,
  result,
}

export default function HostGamePage({
  params: { id: gameId },
}: {
  params: { id: string }
}) {
  const [currentScreen, setCurrentScreen] = useState<AdminScreens>(AdminScreens.lobby)
  const [quizSet, setQuizSet] = useState<any>(null)
  const [currentQuestionSequence, setCurrentQuestionSequence] = useState(0)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [rawOriginUrl, setRawOriginUrl] = useState('https://wsa-trivia.vercel.app')

  // Safely grab the live deployment URL when running inside a client browser session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRawOriginUrl(window.location.origin)
    }
  }, [])

  // Fetch baseline room specifications
  const fetchRoomData = useCallback(async () => {
    const { data: game } = await supabase
      .from('games')
      .select('phase, current_question_sequence, quiz_set_id')
      .eq('id', gameId)
      .single()

    if (game) {
      setCurrentQuestionSequence(game.current_question_sequence)
      
      if (game.phase === 'lobby') setCurrentScreen(AdminScreens.lobby)
      if (game.phase === 'quiz' || game.phase === 'show_results') setCurrentScreen(AdminScreens.quiz)
      if (game.phase === 'result') setCurrentScreen(AdminScreens.result)

      const { data: quiz } = await supabase
        .from('quiz_sets')
        .select(`*, questions(*, choices(*))`)
        .eq('id', game.quiz_set_id)
        .single()
      
      if (quiz) setQuizSet(quiz)
    }
  }, [gameId])

  // Compile scores from answers table natively for high volume
  const fetchLeaderboard = useCallback(async () => {
    const { data: players } = await supabase
      .from('participants')
      .select('id, nickname')
      .eq('game_id', gameId)

    if (!players || players.length === 0) return

    const playerIds = players.map((p: any) => String(p.id))
    const { data: answersRows } = await supabase
      .from('answers')
      .select('participant_id, score')
      .in('participant_id', playerIds)

    const scoreMap: Record<string, number> = {}
    playerIds.forEach(id => { scoreMap[id] = 0 })

    if (answersRows) {
      answersRows.forEach((ans: any) => {
        const pId = String(ans.participant_id)
        if (scoreMap[pId] !== undefined) {
          scoreMap[pId] += Number(ans.score || 0)
        }
      })
    }

    const compiled = players.map((p: any) => ({
      nickname: p.nickname,
      score: scoreMap[String(p.id)] || 0
    })).sort((a, b) => b.score - a.score).slice(0, 5) // Grab top 5

    setLeaderboard(compiled)
  }, [gameId])

  useEffect(() => {
    fetchRoomData()
  }, [fetchRoomData])

  // Monitor live data state configurations
  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel('host_main_sync_stream')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: any) => {
          const updated = payload.new
          setCurrentQuestionSequence(updated.current_question_sequence)
          
          if (updated.phase === 'lobby') setCurrentScreen(AdminScreens.lobby)
          if (updated.phase === 'quiz' || updated.phase === 'show_results') setCurrentScreen(AdminScreens.quiz)
          if (updated.phase === 'result') {
            setCurrentScreen(AdminScreens.result)
            fetchLeaderboard()
          }
        }
      ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetchRoomData, fetchLeaderboard])

  // Count active players inside the lobby loop
  useEffect(() => {
    if (currentScreen !== AdminScreens.lobby) return
    
    const checkLobbyCount = async () => {
      const { count } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      setTotalPlayers(count || 0)
    }
    checkLobbyCount()

    const channel = supabase
      .channel('lobby_entrance_counter')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` },
        () => checkLobbyCount()
      ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentScreen, gameId])

  const handleStartGame = async () => {
    await supabase
      .from('games')
      .update({ phase: 'quiz', current_question_sequence: 0 })
      .eq('id', gameId)
  }

  // --- RENDERING VIEWS ---

  if (currentScreen === AdminScreens.lobby) {
    // Generate an absolute query destination pointing straight to your mobile landing interface
    const directJoinUrl = `${rawOriginUrl}/game/${gameId}`
    const googleQrApi = `https://chart.googleapis.com/chart?cht=qr&chs=400x400&chl=${encodeURIComponent(directJoinUrl)}&chld=M|1`

    return (
      <main className="bg-gray-900 min-h-screen text-white flex flex-col justify-between p-12 select-none relative overflow-hidden">
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes bday-glow {
            0% { color: #f472b6; text-shadow: 0 0 10px #f472b6; }
            33% { color: #fbbf24; text-shadow: 0 0 10px #fbbf24; }
            66% { color: #60a5fa; text-shadow: 0 0 10px #60a5fa; }
            100% { color: #f472b6; text-shadow: 0 0 10px #f472b6; }
          }
          .bday-text {
            animation: bday-glow 3s linear infinite;
          }
        `}} />

        {/* Top Minimal Branding Track */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-4 w-full">
          <div>
            <span className="text-xs font-black text-[#1368ce] tracking-widest uppercase block">Public Charter Network</span>
            <h2 className="text-xl font-black tracking-tight uppercase text-white">Wallace Stegner Academy</h2>
          </div>
          <div className="text-right">
            <span className="bg-[#e21b3c]/10 border border-[#e21b3c]/30 rounded-xl px-4 py-1.5 text-xs font-black text-[#e21b3c] uppercase tracking-wider animate-pulse">
              ☀️ Daytime Assembly Edition
            </span>
          </div>
        </div>

        {/* Giant Main Layout Container Split */}
        <div className="grid grid-cols-12 gap-12 my-auto items-center w-full max-w-6xl mx-auto">
          
          {/* LEFT PANEL: High Contrast Automatic Scan Matrix */}
          <div className="col-span-5 bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center justify-center border-4 border-blue-500 transform hover:scale-[1.01] transition-transform">
            <span className="text-xs font-black text-gray-500 tracking-widest uppercase mb-4 text-center">
              📱 SCAN QR CODE TO JOIN NOW
            </span>
            <img 
              src={googleQrApi} 
              alt="Scan Room Entry QR Code" 
              className="w-full max-w-[320px] aspect-square block bg-white rounded-xl shadow-inner select-none"
              draggable="false"
            />
            <div className="mt-4 text-center bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200 w-full">
              <span className="text-[10px] uppercase font-black text-gray-400 block tracking-wider">Alternative Web link</span>
              <span className="text-sm font-black text-blue-600 break-all select-all tracking-tight uppercase">
                {rawOriginUrl.replace('https://', '')}
              </span>
            </div>
          </div>

          {/* RIGHT PANEL: Controls, Birthday Greeting, & User Registry Counter */}
          <div className="col-span-7 space-y-6">
            <div className="bg-black/30 border border-gray-800 p-8 rounded-3xl shadow-xl">
              
              <div className="mb-4 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 border border-pink-500/40 rounded-full py-2 px-6 inline-block animate-pulse">
                <span className="text-xs font-black tracking-widest bday-text uppercase">
                  🎉 HAPPY BIRTHDAY, ANNA! 🎂
                </span>
              </div>

              <h1 className="text-4xl font-black tracking-tight uppercase leading-tight text-white">
                Staff Trivia Arena
              </h1>
              <p className="text-gray-400 text-sm font-medium mt-1 leading-relaxed">
                Take out your phone, point your camera app at the matrix block on the left, and enter your nickname to lock in your registration row.
              </p>

              <div className="mt-6 flex gap-4 items-center">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl py-4 px-8 inline-block relative">
                  <span className="absolute -top-3 -right-3 text-2xl animate-bounce">🎈</span>
                  <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Staff Logged In</span>
                  <span className="text-4xl font-black text-green-400 mt-0.5 block tracking-tight tabular-nums">
                    {totalPlayers}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black text-2xl py-5 rounded-2xl uppercase tracking-wider shadow-lg border-b-4 border-pink-800 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              Start Assembly Game 🚀
            </button>
          </div>
        </div>

        {/* Footer Banner */}
        <div className="text-center text-[10px] uppercase font-bold tracking-widest text-gray-600 border-t border-gray-800/60 pt-4 w-full">
          Wallace Stegner Academy • Campus Administration Arena
        </div>
      </main>
    )
  }

  if (currentScreen === AdminScreens.quiz && quizSet?.questions) {
    return (
      <Quiz
        key={`quiz_seq_${currentQuestionSequence}`}
        questions={quizSet.questions}
        currentSequence={currentQuestionSequence}
        gameId={gameId}
      />
    )
  }

  if (currentScreen === AdminScreens.result) {
    return (
      <main className="bg-purple-950 min-h-screen text-white flex flex-col justify-center items-center p-8 select-none relative overflow-hidden">
        
        {/* CSS EMULATED CONFETTI GENERATOR + GLOW EFFECTS */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes float-rain {
            0% { transform: translateY(-50px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(105vh) rotate(360deg); opacity: 0.3; }
          }
          @keyframes text-sparkle {
            0% { text-shadow: 0 0 15px #f472b6, 0 0 30px #c084fc; }
            50% { text-shadow: 0 0 25px #60a5fa, 0 0 45px #f472b6; }
            100% { text-shadow: 0 0 15px #f472b6, 0 0 30px #c084fc; }
          }
          .confetti-piece {
            position: absolute;
            top: -20px;
            width: 12px;
            height: 12px;
            border-radius: 3px;
            animation: float-rain 6s linear infinite;
          }
          .swift-glow-title {
            animation: text-sparkle 3s ease-in-out infinite;
          }
        `}} />

        {/* Generate 25 floating colored glitter particles natively */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 25 }).map((_, i) => {
            const colors = ['#f472b6', '#c084fc', '#60a5fa', '#fbbf24', '#34d399']
            const leftPos = Math.random() * 100
            const animDelay = Math.random() * 5
            const animDuration = 4 + Math.random() * 4
            return (
              <div
                key={i}
                className="confetti-piece"
                style={{
                  left: `${leftPos}%`,
                  backgroundColor: colors[i % colors.length],
                  animationDelay: `${animDelay}s`,
                  animationDuration: `${animDuration}s`
                }}
              />
            )
          })}
        </div>

        {/* Master Leaderboard Card */}
        <div className="max-w-2xl w-full bg-gradient-to-br from-purple-900/60 to-black/50 backdrop-blur rounded-3xl p-10 shadow-2xl border-4 border-pink-400 text-center relative z-10 scale-100">
          <span className="text-4xl mb-2 block animate-bounce">👑</span>
          <h1 className="text-4xl font-black uppercase tracking-tight swift-glow-title text-pink-300">
            THE ERAS LEADERBOARD
          </h1>
          <span className="text-[10px] font-black tracking-widest text-white bg-pink-500 px-3 py-0.5 rounded-full inline-block mt-2 uppercase border border-pink-300/40">
            Taylor&apos;s Version 🎸
          </span>

          {/* Player Ranking Rows Stack */}
          <div className="mt-10 space-y-3.5 text-left">
            {leaderboard.length === 0 ? (
              <p className="text-center text-purple-300 font-bold animate-pulse">Fetching champions list...</p>
            ) : (
              leaderboard.map((player, index) => {
                const placementColors = [
                  'from-yellow-400/20 via-amber-400/10 to-transparent border-yellow-400 text-yellow-300 font-black scale-105 shadow-xl',
                  'from-slate-300/10 to-transparent border-slate-400 text-slate-300 font-extrabold',
                  'from-amber-600/10 to-transparent border-amber-600 text-amber-500 font-bold',
                  'from-purple-900/10 to-transparent border-purple-800 text-purple-300',
                  'from-purple-900/10 to-transparent border-purple-900 text-purple-400'
                ]
                
                const badges = ['🏆 1st', '🥈 2nd', '🥉 3rd', '✨ 4th', '✨ 5th']

                return (
                  <div
                    key={index}
                    className={`bg-gradient-to-r ${placementColors[index] || placementColors[4]} border rounded-2xl py-4 px-6 flex justify-between items-center transition-all`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm uppercase tracking-wider opacity-90">{badges[index]}</span>
                      <span className="text-xl uppercase tracking-wide">{player.nickname}</span>
                    </div>
                    <span className="text-2xl tracking-tight font-black tabular-nums">
                      {player.score} <span className="text-xs opacity-50">pts</span>
                    </span>
                  </div>
                )
              })
            )}
          </div>

          <div className="mt-8 text-[11px] font-bold text-purple-400 uppercase tracking-widest border-t border-purple-900/60 pt-6">
            🏰 Wallace Stegner Academy Assembly
          </div>
        </div>
      </main>
    )
  }

  return null
}
