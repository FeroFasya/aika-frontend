import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';

// Menerima 2 sakelar baru dari luar
export default function AikaModel({ emosiAktif, isFeroTyping }) {
  const [vrm, setVrm] = useState(null);
  
  const timeRef = useRef(0);
  const blinkTimerRef = useRef(0);

  // --- LOGIKA BARU: MEMORI UNTUK DURASI AKSI ---
  const nodTimerRef = useRef(0); // Pencatat waktu untuk mengangguk

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      '/Aika.vrm',
      (gltf) => {
        const loadedVrm = gltf.userData.vrm;
        loadedVrm.scene.rotation.y = Math.PI; 

        // DEBUG: Log semua available expressions
        console.log('📊 Available Expressions in Model:');
        if (loadedVrm.expressionManager) {
          const allExpressions = loadedVrm.expressionManager.expressionMap;
          Object.keys(allExpressions).forEach(key => {
            console.log(`  - ${key}`);
          });
        }

        const leftArm = loadedVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
        const rightArm = loadedVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
        if (leftArm) leftArm.rotation.z = 1.2; 
        if (rightArm) rightArm.rotation.z = -1.2;

        setVrm(loadedVrm);
      },
      undefined,
      (error) => console.error("Gagal memanggil model:", error)
    );
  }, []);

  useFrame((state, delta) => {
    if (vrm) {
      timeRef.current += delta;
      
      const spine = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
      if (spine) spine.rotation.x = Math.sin(timeRef.current * 2) * 0.02;

      // 1. RESET SEMUA OTOT WAJAH KE 0 (Mengonsolidasikan perubahanmu)
      vrm.expressionManager.setValue('happy', 0);
      vrm.expressionManager.setValue('angry', 0);
      vrm.expressionManager.setValue('sad', 0);
      vrm.expressionManager.setValue('relaxed', 0);
      vrm.expressionManager.setValue('Surprised', 0); // Kabel saraf kaget
      vrm.expressionManager.setValue('blink', 0);      // Kabel saraf pejam mata
      // Preset Vokal (Bisa kita pakai untuk lipsync vokal nanti)
      vrm.expressionManager.setValue('aa', 0);
      vrm.expressionManager.setValue('ih', 0);
      vrm.expressionManager.setValue('ou', 0);
      vrm.expressionManager.setValue('ee', 0);
      vrm.expressionManager.setValue('oh', 0);

      // 2. AMBIL TULANG KEPALA & LEHER (Kabel Saraf Aksi)
      const head = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
      const neck = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Neck);
      
      // Reset rotasi tulang ke posisi lurus (0)
      if (head) head.rotation.x = 0;
      if (neck) neck.rotation.z = 0;

      // 3. REAKSI SAAT FERO MENGETIK (Fokus / Melek)
      if (isFeroTyping) {
         vrm.expressionManager.setValue('relaxed', 0.8);
      } 
      // 4. REAKSI EMOSI DARI TEKS
      else if (emosiAktif) {
        console.log('👁️ Emosi diterima AikaModel:', emosiAktif); // Debug
        
        if (emosiAktif === 'senyum' || emosiAktif === 'tawa') {
          console.log('😊 Set Happy');
          vrm.expressionManager.setValue('happy', 1.0);
        } else if (emosiAktif === 'marah' || emosiAktif === 'kesal') {
          console.log('😠 Set Angry');
          vrm.expressionManager.setValue('angry', 1.0);
        } else if (emosiAktif === 'sedih') {
          console.log('😢 Set Sad - TRIGGERED! (emosiAktif=', emosiAktif, ')');
          console.log('   Setting sad to 1.0');
          vrm.expressionManager.setValue('sad', 1.0);
          console.log('   Nilai sad setelah set:', vrm.expressionManager.getValue('sad'));
        } 
        // Kabel Saraf Kaget (Sekarang ada kabel dan otot)
        else if (emosiAktif === 'kaget') {
          console.log('😲 Set Surprised - TRIGGERED!');
          vrm.expressionManager.setValue('Surprised', 1.0); // Pakai string langsung
        }
        // Kabel Saraf Santai yang kamu buat
        else if (emosiAktif === 'santai') {
          console.log('😎 Set Relaxed/Santai');
          vrm.expressionManager.setValue('relaxed', 0.6); // Ganti ke 'relaxed', bukan 'blink'
        }
        
        // --- AKSI FISIK TULANG (Dengan Sirkuit Pemberhenti) ---
        else if (emosiAktif === 'miring' && neck) {
          console.log('🔄 Leher Miring');
          neck.rotation.z = -0.15; // Miringkan leher
        } else if (emosiAktif === 'mengangguk' && head) {
          console.log('👤 Mengangguk');
          // Menyalakan pencatat waktu aksi
          nodTimerRef.current += delta;
          
          // Selama waktu di bawah 1 detik, paksa kepalanya mengikuti sinus wave cepat
          if (nodTimerRef.current < 1.0) {
            head.rotation.x = Math.sin(nodTimerRef.current * 12) * 0.15; // Kecepatan dinaikkan agar lebih natural
          } else {
            // Setelah 1 detik (aksi selesai), paksa kepalanya kembali tegak (0)
            head.rotation.x = 0;
            // Penting: Kita tidak mematikan 'emosiAktif' di App.jsx, 
            // tapi kita menghentikan pergerakan fisiknya di sini.
          }
        }
      } 
      // Jika emosi yang aktif BUKAN 'mengangguk', pastikan pencatat waktunya di-reset ke 0
      else {
        nodTimerRef.current = 0; 
      }

      // Sistem Berkedip Otomatis (Matikan saat emosi ekstrem)
      // Default: mata BUKA (blink=0). Setiap 4 detik, ada 1x blink smooth (0→1→0)
      if (emosiAktif !== 'senyum' && emosiAktif !== 'marah') {
        blinkTimerRef.current += delta;
        
        // Blink animation trigger: setiap 4 detik
        if (blinkTimerRef.current > 4 && blinkTimerRef.current < 4.2) {
          // Animation duration: 0.2 detik (smooth tutup-buka)
          const timeInBlink = (blinkTimerRef.current - 4) / 0.2; // 0 to 1
          // 0→1→0 motion (sin dari 0 ke π)
          const blinkRatio = Math.sin(timeInBlink * Math.PI);
          vrm.expressionManager.setValue('blink', blinkRatio);
        }
        
        // Reset timer setelah 1 siklus blink
        if (blinkTimerRef.current > 4.2) {
          blinkTimerRef.current = 0;
        }
      }

      vrm.update(delta);
    }
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}