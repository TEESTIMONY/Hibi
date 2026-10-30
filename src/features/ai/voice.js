export function createVoiceCapture({ onFile, onStatus, onError }) {
  let recorder;
  let stream;
  let timer;
  let chunks = [];
  let discard = false;

  function release() {
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError('Recording is not available here. Upload a voice recording instead.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { release(); onError('Use an uploaded MP3, M4A, WAV, or WebM recording in this browser.'); return; }
      chunks = [];
      discard = false;
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => { release(); onStatus(false); onError('The recording stopped unexpectedly.'); });
      recorder.addEventListener('stop', () => {
        const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        release();
        onStatus(false);
        if (!discard && blob.size) onFile(new File([blob], `Voice note ${new Date().toISOString().slice(0, 16).replace(':', '-')}.${extension}`, { type: mimeType }));
      });
      recorder.start(1000);
      onStatus(true);
      timer = setTimeout(() => stop(), 3 * 60 * 1000);
    } catch {
      release();
      onError('Microphone access was unavailable. Allow it in your browser or upload a recording.');
    }
  }

  function stop(cancel = false) {
    discard = cancel;
    if (recorder?.state === 'recording') recorder.stop();
    else release();
  }

  return { start, stop };
}
