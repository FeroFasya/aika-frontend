import { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import AikaModel from './AikaModel';
import './App.css';

function FloatingText({ text, isVisible, isAudioPlaying }) {
  if (!isVisible || !text) return null;

  const characters = text.split('');

  return (
    <Html position={[0, 1.0, 0.4]} center zIndexRange={[100, 0]}>
      <div className="w-[90vw] max-w-[450px] text-3xl md:text-4xl tracking-wide leading-snug text-center">
        {characters.map((char, index) => (
          <span
            key={index}
            className={`inline-block miside-text ${isAudioPlaying ? 'animate-wave-entry' : 'animate-fall-exit'}`}
            style={{ 
              animationDelay: isAudioPlaying ? `${index * 0.03}s` : `${index * 0.015}s`,
              whiteSpace: char === ' ' ? 'pre' : 'normal',
              padding: '2px' // Memberi ruang agar stroke font tidak terpotong
            }}
          >
            {char}
          </span>
        ))}
      </div>
    </Html>
  );
}

function ResponsiveCamera() {
  const { camera } = useThree();
  
  useEffect(() => {
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 768;
      if (isDesktop) {
        // Dekatkan kamera untuk layar desktop agar Aika tidak terlihat mungil
        camera.position.set(0, 1.35, 1.2);
        camera.fov = 35;
      } else {
        // Posisi default untuk layar mobile
        camera.position.set(0, 1.45, 1.5);
        camera.fov = 40;
      }
      camera.updateProjectionMatrix();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera]);

  return null;
}

const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  RECEIVED: 'received'
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
  const [emosiAika, setEmosiAika] = useState({ emosi: 'netral', id: 0 });
  const [feroTyping, setFeroTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  
  const [timeState, setTimeState] = useState(new Date());
  const [currentLocation, setCurrentLocation] = useState("Kamar Tidur (Room)");

  // --- REFS UNTUK MENGHINDARI STALE STATE PADA TIMER ---
  const latestChatRef = useRef(daftarChat);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    latestChatRef.current = daftarChat;
  }, [daftarChat]);

  // --- SISTEM IDLE (AIKA BOSAN) ---
  const kirimPesanKeAika = async (pesanTeks, isHidden = false) => {
    setIsLoading(true);

    const currentTimeString = timeState.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    try {
      const respon = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: pesanTeks,
          history: latestChatRef.current,
          location: currentLocation,
          time: currentTimeString
        })
      });
      const data = await respon.json();

      const teksIndonesia = data.reply;
      const teksJepang = data.japanese_reply || data.reply;
      const emosiAikaBaru = data.emotion || 'netral';

      // --- FETCH TTS ---
      let audioTtsUrl = null;
      try {
        const responTts = await fetch(`${import.meta.env.VITE_API_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: teksJepang })
        });
        if (responTts.ok) {
          const dataTts = await responTts.json();
          if (dataTts.audioUrl) {
            audioTtsUrl = dataTts.audioUrl;
          }
        }
      } catch (err) {
        console.error("Gagal mengambil suara:", err);
      }

      setEmosiAika({ emosi: emosiAikaBaru, id: Date.now() });
      
      // Jika pesan bukan rahasia, ubah status pesan terakhir User menjadi RECEIVED
      if (!isHidden) {
        setDaftarChat((prev) => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], status: MESSAGE_STATUS.RECEIVED },
        ]);
      }

      setDaftarChat((prev) => [...prev, {
        role: 'aika',
        text: teksIndonesia,
        timestamp: new Date(),
        status: MESSAGE_STATUS.RECEIVED,
        id: `msg-${Date.now()}`
      }]);

      if (audioTtsUrl) {
        setAudioUrl(audioTtsUrl);
      }

    } catch (error) {
      setDaftarChat((prev) => [...prev, {
        role: 'aika',
        text: 'Aduhh kepalaku pusing... kayaknya limit kamu habis deh, coba lagi besok',
        timestamp: new Date(),
        status: MESSAGE_STATUS.RECEIVED,
        id: `msg-error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
      resetIdleTimer(); // Reset timer setelah Aika selesai bicara
    }
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // Trigger idle setelah 60 detik
      const promptRahasia = "(Sistem: User diam saja selama 1 menit dan mendiamkanmu. Coba sapa dia, goda dia, atau cari perhatiannya. Gunakan emosi [acak], [goda], atau [sedih]. Jangan sebut ini pesan dari sistem, bertingkahlah natural menyapa/mengeluh)";
      kirimPesanKeAika(promptRahasia, true);
    }, 60000); // 60 detik
  };

  // Pantau aktivitas layar untuk me-reset timer
  useEffect(() => {
    resetIdleTimer(); // Mulai timer saat awal
    const handleActivity = () => resetIdleTimer();
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, []);

  // Inisialisasi Global Audio Context agar tidak diblokir (Autoplay Policy)
  useEffect(() => {
    const unlockAudio = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!window.globalAudioContext) {
        window.globalAudioContext = new AudioContext();
      }
      if (window.globalAudioContext.state === 'suspended') {
        window.globalAudioContext.resume();
      }
    };
    window.addEventListener('click', unlockAudio);
    return () => window.removeEventListener('click', unlockAudio);
  }, []);

  const toggleListen = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser kamu tidak mendukung fitur suara (STT). Coba gunakan Chrome.");
      return;
    }

    setIsPhoneMode(true); // Masuk ke mode Immersive

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false); // Matikan visual mikrofon langsung
      
      const newFeroMessage = {
        role: 'fero',
        text: transcript,
        timestamp: new Date(),
        status: MESSAGE_STATUS.SENDING,
        id: `msg-${Date.now()}`
      };
      
      setDaftarChat((prev) => [...prev, newFeroMessage]);
      resetIdleTimer();
      
      // Auto-send ke Aika!
      await kirimPesanKeAika(transcript, false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // Update Clock
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeState(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = timeState.getHours();
  const minutes = timeState.getMinutes();
  const timeString = `${hours.toString().padStart(2, '0')}.${minutes.toString().padStart(2, '0')}`;
  const isNight = hours >= 18 || hours < 6;
  const modeText = isNight ? 'NIGHT MODE' : 'DAY MODE';
  const backgroundUrl = isNight ? '/backgrounds/room/room_night.png' : '/backgrounds/room/room_normal.png';

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
    resetIdleTimer();

    await kirimPesanKeAika(pesanFero, false);
  };

  // Ambil pesan terakhir dari Aika
  const latestAikaMessage = [...daftarChat].reverse().find(msg => msg.role === 'aika')?.text || "...";

  return (
    <div className="relative w-full h-screen font-sans overflow-hidden bg-black">
      
      {/* Audio Element Tersembunyi (Aman dari Garbage Collection) */}
      <audio 
        id="aika-voice-player" 
        crossOrigin="anonymous" 
        className="hidden" 
        onPlay={() => setIsAudioPlaying(true)}
        onEnded={() => setIsAudioPlaying(false)}
        onPause={() => setIsAudioPlaying(false)}
      />

      {/* 1. DYNAMIC BACKGROUND LAYER */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
        style={{ backgroundImage: `url(${backgroundUrl})` }}
      />
      
      {/* 2. 3D CANVAS LAYER */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Posisi kamera diatur secara responsif via komponen ResponsiveCamera */}
        <Canvas>
          <ResponsiveCamera />
          <ambientLight intensity={isNight ? 0.4 : 0.9} />
          <directionalLight 
            position={[0, 2, 5]} 
            intensity={isNight ? 0.5 : 1.2} 
            color={isNight ? "#8fa8ff" : "#ffffff"}
          />
          <Suspense fallback={null}>
            <AikaModel emosiAktif={emosiAika.emosi} emosiTrigger={emosiAika.id} isFeroTyping={feroTyping} audioUrl={audioUrl} />
            <FloatingText 
              text={isPhoneMode ? latestAikaMessage : ""} 
              isVisible={isPhoneMode} 
              isAudioPlaying={isAudioPlaying} 
            />
          </Suspense>
          {/* OrbitControls dikunci agar Aika tidak bisa diputar, tapi targetnya dipastikan ke dada/wajah */}
          <OrbitControls 
            target={[0, 1.25, 0]} 
            enableRotate={false} 
            enablePan={false} 
            enableZoom={false} 
          />
        </Canvas>
      </div>

      {/* 3. UI OVERLAY LAYER */}
      <div className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none">
        
        {/* TOP BAR */}
        <div className="w-full p-4 md:p-6 flex justify-between items-start">
          
          {/* Clock Widget */}
          <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl px-4 py-2 border border-zinc-700/50 shadow-lg flex flex-col items-center">
            <span className="text-white font-bold text-xl md:text-2xl tracking-wider">{timeString}</span>
            <span className="text-pink-500 text-[9px] md:text-[10px] font-bold tracking-[0.2em] uppercase mt-0.5">{modeText}</span>
          </div>

          {/* Nav Pills */}
          <div className="bg-zinc-900/60 backdrop-blur-md rounded-full p-1.5 flex gap-1 md:gap-2 border border-zinc-700/50 shadow-lg pointer-events-auto">
            <button className="bg-cyan-400 text-black px-4 md:px-6 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-transform active:scale-95">ROOM</button>
            <button className="text-zinc-400 hover:text-white px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider transition-colors">KITCHEN</button>
            <button className="hidden sm:block text-zinc-400 hover:text-white px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider transition-colors">OUTSIDE</button>
            <button className="hidden sm:block text-zinc-400 hover:text-white px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider transition-colors">LIVING</button>
          </div>

          {/* Spacer untuk menjaga layout nav tetap di tengah (flex-between) */}
          <div className="w-[80px] md:w-[100px]"></div>
        </div>

        {/* VISUAL NOVEL TEXTBOX (HANYA MUNCUL JIKA TIDAK DI PHONE MODE) */}
        <div className={`w-full max-w-5xl mx-auto px-4 pb-6 md:pb-8 pointer-events-auto transition-all duration-700 ${isPhoneMode ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <div className="relative bg-zinc-900/85 backdrop-blur-xl border-2 border-pink-500 rounded-2xl md:rounded-3xl shadow-2xl p-5 md:p-8 flex flex-col gap-4 md:gap-6 transform transition-all">
            
            {/* NAME BADGE */}
            <div className="absolute -top-4 md:-top-5 left-6 md:left-8 flex items-center gap-3">
              <div className="bg-gradient-to-r from-pink-500 to-rose-400 text-white px-5 md:px-6 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-bold tracking-widest shadow-lg border-2 border-zinc-900">
                AIKA
              </div>
              <div className="hidden md:block text-cyan-400 text-xs font-bold tracking-widest uppercase">
                VIRTUAL COMPANION
              </div>
            </div>

            {/* TEXT DIALOGUE */}
            <div className="mt-3 md:mt-2 min-h-[60px] md:min-h-[80px]">
              {isLoading ? (
                 <div className="flex items-center gap-3 mt-4">
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{animationDelay: '0s'}}></div>
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{animationDelay: '0.4s'}}></div>
                </div>
              ) : (
                <p key={emosiAika.id} className="text-white text-base md:text-xl font-medium leading-relaxed tracking-wide animate-[fadeInText_0.5s_ease-out]">
                  {latestAikaMessage}
                </p>
              )}
            </div>

            {/* INPUT FIELD */}
            <form onSubmit={handleKirim} className="mt-2 md:mt-4">
              <div className="relative flex items-center bg-black/40 border border-zinc-700/50 rounded-xl md:rounded-2xl p-1.5 transition-all focus-within:border-pink-500/50 focus-within:bg-black/60">
                <button
                  type="button"
                  onClick={toggleListen}
                  disabled={isLoading}
                  className={`p-2.5 md:p-3 rounded-lg md:rounded-xl mr-1 transition-colors duration-200 shrink-0 ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" x2="12" y1="19" y2="22"></line>
                  </svg>
                </button>
                <input
                  type="text"
                  value={inputPesan}
                  onChange={(e) => {
                    setInputPesan(e.target.value);
                    setFeroTyping(e.target.value.length > 0);
                  }}
                  disabled={isLoading}
                  placeholder={isListening ? "Mendengarkan..." : "Balas pesan Aika..."}
                  className="w-full bg-transparent text-white px-2 py-2 md:py-3 outline-none text-sm placeholder-zinc-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputPesan.trim()}
                  className="bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 border border-teal-500/30 p-2.5 md:p-3 rounded-lg md:rounded-xl ml-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5">
                    <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                  </svg>
                </button>
              </div>
            </form>

          </div>
        </div>

        {/* IMMERSIVE PHONE MODE UI (TOMBOL MIC & CANCEL DI TENGAH BAWAH) */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 pointer-events-auto transition-all duration-700 ${isPhoneMode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
          <button
            onClick={() => setIsPhoneMode(false)}
            className="w-12 h-12 rounded-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <div className="relative">
            {/* Pulsing ring jika sedang mendengarkan */}
            {isListening && <div className="absolute inset-0 rounded-full bg-pink-500 animate-ping opacity-50"></div>}
            <button
              onClick={toggleListen}
              disabled={isLoading && !isListening}
              className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(236,72,153,0.5)] transition-all active:scale-95 ${
                isListening ? 'bg-pink-500 text-white' : 'bg-zinc-900/80 border border-pink-500/50 text-pink-400 hover:bg-pink-500/20 backdrop-blur-md'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
            </button>
          </div>
        </div>

        {/* VOICEVOX COPYRIGHT WATERMARK */}
        <div className="absolute bottom-2 right-4 md:bottom-4 md:right-6 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
          <p className="text-[10px] md:text-xs text-white/70 font-medium tracking-wide drop-shadow-md">
            音声合成: VOICEVOX (もち子さん)
          </p>
        </div>

      </div>
    </div>
  );
}

export default App;