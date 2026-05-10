import { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import AikaModel from './AikaModel';
import { formatRelativeTime, formatTime, estimateWaitTime } from './utils/timeFormatter';
import './App.css';

const MESSAGE_STATUS = {
  SENDING: 'sending',    // ✓
  SENT: 'sent',          // ✓
  RECEIVED: 'received',  // ✓✓
  READ: 'read'           // ✓✓ (for future read receipts)
};

function App() {
  const [daftarChat, setDaftarChat] = useState([
    { 
      role: 'aika', 
      text: 'Halo Fero. Jarak sedekat ini... membuatku bisa melihatmu lebih jelas.',
      timestamp: new Date(),
      status: MESSAGE_STATUS.RECEIVED,
      id: 'init-msg'
    }
  ]);
  const [inputPesan, setInputPesan] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emosiAika, setEmosiAika] = useState('netral');
  const [feroTyping, setFeroTyping] = useState(false);
  const [estimatedWaitTime, setEstimatedWaitTime] = useState(0);
  const [pullToRefresh, setPullToRefresh] = useState(0); // 0-100 untuk pull distance
  const [isRefreshing, setIsRefreshing] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const touchStartRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [daftarChat]);

  // Handle pull-to-refresh gesture
  const handleTouchStart = (e) => {
    if (chatContainerRef.current?.scrollTop === 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    
    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartRef.current;
    
    if (distance > 0 && chatContainerRef.current?.scrollTop === 0) {
      setPullToRefresh(Math.min(distance / 3, 100)); // Max 100
    }
  };

  const handleTouchEnd = () => {
    if (pullToRefresh > 50 && !isRefreshing) {
      setIsRefreshing(true);
      // Simulate refresh
      setTimeout(() => {
        setPullToRefresh(0);
        setIsRefreshing(false);
      }, 1500);
    } else {
      setPullToRefresh(0);
    }
    touchStartRef.current = 0;
  };

  const handleKirim = async (e) => {
    e.preventDefault();
    if (!inputPesan.trim()) return;

    const pesanFero = inputPesan;
    const newFeroMessage = {
      role: 'fero',
      text: pesanFero,
      timestamp: new Date(),
      status: MESSAGE_STATUS.SENDING,
      id: `msg-${Date.now()}`
    };
    
    setDaftarChat((prev) => [...prev, newFeroMessage]);
    setInputPesan('');
    setFeroTyping(false);
    setIsLoading(true);

    // Estimate wait time
    const estimatedTime = estimateWaitTime(daftarChat.length);
    setEstimatedWaitTime(estimatedTime);

    try {
      const respon = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: pesanFero,
          history: daftarChat
        })
      });
      const data = await respon.json();

      const teksBalasan = data.reply;
      const emosiMatch = teksBalasan.match(/\[(.*?)\]/);

      let emosiBaru = 'netral';
      let teksBersih = teksBalasan;

      if (emosiMatch) {
        emosiBaru = emosiMatch[1].toLowerCase();
        teksBersih = teksBalasan.replace(emosiMatch[0], '').trim();
      }

      setEmosiAika(emosiBaru);
      
      // Update Fero message status to RECEIVED
      setDaftarChat((prev) => [
        ...prev.slice(0, -1),
        { ...prev[prev.length - 1], status: MESSAGE_STATUS.RECEIVED },
      ]);

      // Add Aika message
      setDaftarChat((prev) => [...prev, {
        role: 'aika',
        text: teksBersih,
        timestamp: new Date(),
        status: MESSAGE_STATUS.RECEIVED,
        id: `msg-${Date.now()}`
      }]);
    } catch (error) {
      setDaftarChat((prev) => [...prev, {
        role: 'aika',
        text: 'Aduhh kepalaku pusing... kayaknya limit fero habis deh, coba lagi besok',
        timestamp: new Date(),
        status: MESSAGE_STATUS.RECEIVED,
        id: `msg-error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
      setEstimatedWaitTime(0);
    }
  };

  const StatusIcon = ({ status }) => {
    if (status === MESSAGE_STATUS.SENDING) {
      return <span className="text-xs text-zinc-400">✓</span>;
    } else if (status === MESSAGE_STATUS.RECEIVED) {
      return <span className="text-xs text-teal-300">✓✓</span>;
    }
    return null;
  };

  return (
    <div className="relative min-h-screen app-background-pink font-sans text-slate-200 overflow-hidden">
      
      {/* --- PETUNJUK UI (HINT) --- */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="bg-zinc-900/60 backdrop-blur-md px-5 py-2 rounded-full border border-zinc-700/50 shadow-lg text-xs text-zinc-300 font-medium tracking-wide flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-teal-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          Usap untuk memutar, cubit untuk zoom
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        {/* PERUBAHAN KAMERA: Posisi Z diubah dari 4.5 menjadi 2.2 untuk setengah badan */}
        <Canvas camera={{ position: [0, 1.4, 2.2], fov: 45 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[0, 2, 5]} intensity={1.2} />
          
          <OrbitControls 
            target={[0, 1.35, 0]} 
            enablePan={false} 
            minDistance={1} 
            maxDistance={6} 
          />
          
          <Suspense fallback={null}>
            <AikaModel emosiAktif={emosiAika} isFeroTyping={feroTyping} />
          </Suspense>
        </Canvas>
      </div>

      <div className="absolute bottom-0 right-0 w-full h-[55vh] md:h-full md:w-[480px] p-4 md:p-6 flex flex-col z-10 pointer-events-none">
        {/* Pull-to-Refresh Indicator */}
        {pullToRefresh > 0 && (
          <div className="flex justify-center items-center mb-2 pointer-events-auto">
            <div className="text-xs text-teal-400 font-medium flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full border-2 border-transparent border-t-teal-400 transition-transform"
                style={{ transform: `rotate(${pullToRefresh * 3.6}deg) scale(${0.5 + pullToRefresh / 200})` }}
              />
              {pullToRefresh < 50 ? 'Pull to refresh' : 'Release to refresh'}
            </div>
          </div>
        )}

        <div 
          ref={chatContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-y-auto flex flex-col gap-4 md:gap-6 scrollbar-hide pb-2 md:pb-4 pointer-events-auto"
        >
          <div className="mt-auto w-full flex flex-col gap-4 md:gap-6 items-start">
            {daftarChat.map((chat, index) => (
              <div
                key={chat.id || index}
                className={`message-slide-in w-full flex ${chat.role === 'fero' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-5 py-3 md:py-4 text-sm leading-relaxed backdrop-blur-md shadow-lg rounded-3xl transition-all duration-300 hover:shadow-xl ${
                    chat.role === 'aika'
                      ? 'bg-zinc-800/40 border border-zinc-700/30 rounded-tl-sm text-zinc-100 hover:bg-zinc-800/60 hover:scale-105 origin-left'
                      : 'bg-teal-500/20 border border-teal-500/30 rounded-tr-sm text-teal-50 hover:bg-teal-500/30 hover:scale-105 origin-right'
                  } flex flex-col`}
                >
                  <p>{chat.text}</p>
                  <div className={`flex items-center gap-2 mt-2 text-xs ${
                    chat.role === 'aika' ? 'text-zinc-400' : 'text-teal-300/70'
                  }`}>
                    <span>{formatTime(chat.timestamp)}</span>
                    {chat.role === 'fero' && <StatusIcon status={chat.status} />}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message-slide-in w-full flex justify-start">
                <div className="max-w-[85%] bg-zinc-800/40 border border-zinc-700/30 px-5 py-4 rounded-3xl rounded-tl-sm backdrop-blur-md shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="thinking-bubble" />
                    <div className="thinking-bubble" style={{ animationDelay: '0.1s' }} />
                    <div className="thinking-bubble" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <p className="text-xs text-zinc-300 mt-3 font-medium">Aika lg mikir...</p>
                  {estimatedWaitTime > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">Est. {estimatedWaitTime}s</p>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={handleKirim} className="mt-2 shrink-0 pointer-events-auto">
          <div className="flex gap-2 md:gap-3 relative">
            <input
              type="text"
              value={inputPesan}
              onChange={(e) => {
                setInputPesan(e.target.value);
                setFeroTyping(e.target.value.length > 0);
              }}
              disabled={isLoading}
              placeholder={isLoading ? "Aika sedang memikirkan respons..." : "Bicara padanya..."}
              className="w-full bg-zinc-900/50 backdrop-blur-xl border border-zinc-700/50 rounded-2xl px-5 md:px-6 py-3.5 md:py-4 text-sm focus:outline-none focus:border-teal-500/70 transition-colors shadow-lg disabled:opacity-50 text-white placeholder-zinc-400"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="send-button bg-teal-500/80 hover:bg-teal-400 backdrop-blur-md border border-teal-400/50 disabled:bg-zinc-800/50 disabled:border-zinc-700/50 disabled:text-zinc-500 text-zinc-50 rounded-2xl w-12 h-12 md:w-14 md:h-14 flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-lg relative overflow-hidden"
            >
              <span className="ripple" />
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5 relative z-10">
                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;