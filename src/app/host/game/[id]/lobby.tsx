'use client'

import { Participant, supabase } from '@/types/types'
import { useQRCode } from 'next-qrcode'

export default function Lobby({
  participants,
  gameId,
}: {
  participants: Participant[]
  gameId: string
}) {
  const { Canvas } = useQRCode()

  const onClickStartGame = async () => {
    const { error } = await supabase
      .from('games')
      .update({ phase: 'quiz' })
      .eq('id', gameId)
    if (error) {
      return alert(error.message)
    }
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white font-sans p-6">
      <div className="flex flex-col md:flex-row justify-between items-center m-auto bg-black border border-gray-800 rounded-3xl p-12 max-w-4xl w-full gap-12 shadow-2xl">
        
        {/* Left Side: Participant List */}
        <div className="flex-1 w-full max-w-md">
          <h2 className="text-2xl font-black mb-4 uppercase tracking-tight text-blue-400">
            Players Joined ({participants.length})
          </h2>
          
          <div className="flex justify-start flex-wrap pb-8 min-h-[150px] content-start gap-2">
            {participants.length === 0 ? (
              <p className="text-gray-500 font-medium animate-pulse">Waiting for staff to scan and join...</p>
            ) : (
              participants.map((participant) => (
                <div
                  className="text-lg font-bold px-4 py-2 bg-[#1e3a8a] text-white rounded-xl shadow-sm border border-blue-500/3xl animate-fade-in"
                  key={participant.id}
                >
                  {participant.nickname}
                </div>
              ))
            )}
          </div>

          <button
            className="w-full bg-white hover:bg-blue-500 hover:text-white text-black font-black text-xl py-5 px-12 rounded-2xl transition-all uppercase tracking-wider shadow-md transform active:scale-95"
            onClick={onClickStartGame}
          >
            Start Game
          </button>
        </div>
        
        {/* Right Side: QR Code Area */}
        <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center shrink-0 border-4 border-[#1e3a8a]">
          <Canvas
            text={`https://wsa-trivia.vercel.app/game/${gameId}`}
            options={{
              errorCorrectionLevel: 'M',
              margin: 2,
              scale: 4,
              width: 320,
            }}
          />
          <p className="text-gray-900 font-black text-md mt-4 tracking-tight uppercase text-center">
            Scan to Join WSA Trivia
          </p>
        </div>

      </div>
    </div>
  )
}
