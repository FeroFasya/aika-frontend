import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMHumanBoneName } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import * as THREE from 'three';

const animationFiles = {
  santai: ['/animations/santai/Happy.fbx', '/animations/santai/Idle.fbx', '/animations/santai/LookingAround.fbx'],
  marah: ['/animations/marah/angry.fbx', '/animations/marah/StandingArguing.fbx', '/animations/marah/No.fbx'],
  malu: ['/animations/malu/Bashful.fbx', '/animations/malu/Talking.fbx', '/animations/malu/Thinking.fbx'],
  sedih: ['/animations/sedih/Sad.fbx', '/animations/sedih/rejected.fbx', '/animations/sedih/Pouting.fbx'],
  goda: ['/animations/goda/Crazy.fbx', '/animations/goda/Petting.fbx', '/animations/marah/angry.fbx'],
  acak: ['/animations/acak/Yawn.fbx', '/animations/acak/Thankful.fbx', '/animations/acak/Waving.fbx']
};

export default function AikaModel({ emosiAktif, emosiTrigger, isFeroTyping, audioUrl }) {
  const [vrm, setVrm] = useState(null);
  const [isAnimReady, setIsAnimReady] = useState(false);

  // Refs untuk audio & lipsync
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- SISTEM SUARA & LIPSYNC ---
  useEffect(() => {
    if (!audioUrl) return;

    const audioElement = document.getElementById('aika-voice-player');
    if (!audioElement) return;

    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = window.globalAudioContext || new AudioContext();
      
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioCtxRef.current.createMediaElementSource(audioElement);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);

      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      audioRef.current = audioElement;
    }

    audioElement.src = audioUrl;
    
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    audioElement.play().catch(e => console.error("Autoplay diblokir:", e));

  }, [audioUrl]);

  useEffect(() => {
    if (vrm && vrm.scene) {
      // Sembunyikan model sampai animasi pertama siap (isAnimReady = true)
      vrm.scene.visible = isAnimReady;
    }
  }, [vrm, isAnimReady]);

  const timeRef = useRef(0);
  const blinkTimerRef = useRef(0);

  // Refs untuk sistem animasi
  const mixerRef = useRef(null);
  const actionsCache = useRef({});
  const currentActionRef = useRef(null);

  // 1. MEMUAT VRM MODEL
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      '/Aika.vrm',
      (gltf) => {
        const loadedVrm = gltf.userData.vrm;
        loadedVrm.scene.rotation.y = Math.PI;

        // Inisialisasi Mixer
        mixerRef.current = new THREE.AnimationMixer(loadedVrm.scene);
        setVrm(loadedVrm);
      },
      undefined,
      (error) => console.error("Gagal memanggil model:", error)
    );

    return () => {
      if (mixerRef.current) mixerRef.current.stopAllAction();
    };
  }, []);

  // 2. STATE MACHINE: MENGUBAH ANIMASI SAAT EMOSI BERUBAH
  useEffect(() => {
    if (!vrm || !mixerRef.current) return;

    let targetEmosi = emosiAktif;
    if (!animationFiles[targetEmosi]) {
      targetEmosi = 'santai'; // Fallback ke santai
    }

    const files = animationFiles[targetEmosi];
    const randomFile = files[Math.floor(Math.random() * files.length)];

    const playAction = (clip) => {
      const action = mixerRef.current.clipAction(clip);
      action.reset();

      // Mengatur agar animasi selain "santai" diputar sekali saja dan berhenti di pose terakhir
      if (targetEmosi !== 'santai') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        // Jika santai, biarkan berulang (idle breathing)
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }

      action.play();

      // Crossfade dari gerakan sebelumnya (jika ada) ke gerakan baru
      if (currentActionRef.current && currentActionRef.current !== action) {
        currentActionRef.current.crossFadeTo(action, 0.5, true);
      } else {
        action.setEffectiveWeight(1);
      }
      currentActionRef.current = action;
      console.log(`🎬 Memainkan animasi: ${randomFile} (Loop: ${targetEmosi === 'santai' ? 'Repeat' : 'Once'})`);
      
      // Beri tahu komponen bahwa animasi pertama sudah siap dimainkan
      if (!isAnimReady) setIsAnimReady(true);
    };

    if (actionsCache.current[randomFile]) {
      // Jika sudah pernah didownload (cache), langsung mainkan
      playAction(actionsCache.current[randomFile]);
    } else {
      // Jika belum, download dan retarget dulu
      retargetAnimationFromUrl(randomFile, vrm).then((clip) => {
        if (clip) {
          actionsCache.current[randomFile] = clip;
          playAction(clip);
        }
      }).catch((err) => console.error(`Gagal meload animasi ${randomFile}:`, err));
    }
  }, [emosiAktif, emosiTrigger, vrm]);

  // 2B. KEMBALI KE IDLE SETELAH ANIMASI SELESAI
  useEffect(() => {
    if (!vrm || !mixerRef.current) return;

    const playIdle = () => {
      const files = animationFiles['santai'];
      const randomFile = files[Math.floor(Math.random() * files.length)];
      
      const doPlay = (clip) => {
        const action = mixerRef.current.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.play();
        if (currentActionRef.current && currentActionRef.current !== action) {
          currentActionRef.current.crossFadeTo(action, 0.5, true);
        } else {
          action.setEffectiveWeight(1);
        }
        currentActionRef.current = action;
        console.log(`🎬 Kembali ke Idle: ${randomFile}`);
      };

      if (actionsCache.current[randomFile]) {
        doPlay(actionsCache.current[randomFile]);
      } else {
        retargetAnimationFromUrl(randomFile, vrm).then((clip) => {
          if (clip) {
            actionsCache.current[randomFile] = clip;
            doPlay(clip);
          }
        });
      }
    };

    const handleFinished = (e) => {
      // Ketika sebuah animasi (yg bukan loop) selesai, mainkan idle
      playIdle();
    };

    mixerRef.current.addEventListener('finished', handleFinished);

    return () => {
      if (mixerRef.current) {
        mixerRef.current.removeEventListener('finished', handleFinished);
      }
    };
  }, [vrm]);

  // 3. RENDER LOOP (USEFRAME)
  useFrame((state, delta) => {
    if (vrm) {
      timeRef.current += delta;

      // --- TARGET EKSPRESI WAJAH ---
      const targets = {
        happy: 0,
        angry: 0,
        sad: 0,
        relaxed: 0,
        Surprised: 0
      };

      if (isFeroTyping) {
        targets.relaxed = 0.8;
      } else {
        if (emosiAktif === 'santai') targets.relaxed = 0.5;
        else if (emosiAktif === 'marah') targets.angry = 1.0;
        else if (emosiAktif === 'malu') { targets.happy = 0.5; }
        else if (emosiAktif === 'sedih') targets.sad = 1.0;
        else if (emosiAktif === 'acak') targets.happy = 0.8;
        else if (emosiAktif === 'goda') { targets.happy = 1.0; }
      }

      // --- LERP EKSPRESI WAJAH ---
      const lerpSpeed = 4 * delta;
      ['happy', 'angry', 'sad', 'relaxed', 'Surprised'].forEach(exp => {
        const current = vrm.expressionManager.getValue(exp) || 0;
        vrm.expressionManager.setValue(exp, THREE.MathUtils.lerp(current, targets[exp], lerpSpeed));
      });

      // --- SISTEM AUDIO LIPSYNC ---
      if (analyserRef.current && dataArrayRef.current && audioRef.current && !audioRef.current.paused) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        let sum = 0;
        let highFreqSum = 0;
        const halfLength = Math.floor(dataArrayRef.current.length / 2);

        for (let i = 0; i < dataArrayRef.current.length; i++) {
          sum += dataArrayRef.current[i];
          if (i > halfLength) highFreqSum += dataArrayRef.current[i];
        }
        
        let volume = sum / dataArrayRef.current.length;
        let highFreqVolume = highFreqSum / halfLength;
        
        // Vokal 'A' dari frekuensi keseluruhan
        let mouthAa = Math.min(1, Math.max(0, (volume - 20) / 60));
        // Vokal 'I' / meringis dari frekuensi tinggi (suara s, t, i, e)
        let mouthIh = Math.min(1, Math.max(0, (highFreqVolume - 10) / 40));
        
        const currentAa = vrm.expressionManager.getValue('aa') || 0;
        const currentIh = vrm.expressionManager.getValue('ih') || 0;
        
        // Kecepatan lerp diturunkan ke 12 agar lebih smooth, tidak patah-patah
        vrm.expressionManager.setValue('aa', THREE.MathUtils.lerp(currentAa, mouthAa, 12 * delta));
        vrm.expressionManager.setValue('ih', THREE.MathUtils.lerp(currentIh, mouthIh, 12 * delta));
      } else {
        const currentAa = vrm.expressionManager.getValue('aa') || 0;
        const currentIh = vrm.expressionManager.getValue('ih') || 0;
        vrm.expressionManager.setValue('aa', THREE.MathUtils.lerp(currentAa, 0, 10 * delta));
        vrm.expressionManager.setValue('ih', THREE.MathUtils.lerp(currentIh, 0, 10 * delta));
      }

      // --- SISTEM BERKEDIP ---
      blinkTimerRef.current += delta;
      if (blinkTimerRef.current > 4 && blinkTimerRef.current < 4.2) {
        const timeInBlink = (blinkTimerRef.current - 4) / 0.2;
        const blinkRatio = Math.sin(timeInBlink * Math.PI);
        vrm.expressionManager.setValue('blink', blinkRatio);
      } else {
        vrm.expressionManager.setValue('blink', 0);
      }
      if (blinkTimerRef.current > 4.2) {
        blinkTimerRef.current = 0;
      }

      // --- UPDATE ANIMASI MIXAMO (FULL BODY) ---
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      vrm.update(delta);
    }
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}