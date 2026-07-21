import os
import re
import tempfile
from flask import Flask, jsonify, request
from faster_whisper import WhisperModel

app = Flask(__name__)
MODEL_NAME = os.environ.get('WHISPER_MODEL', 'small.en')
model = WhisperModel(
    MODEL_NAME,
    device=os.environ.get('WHISPER_DEVICE', 'cpu'),
    compute_type=os.environ.get('WHISPER_COMPUTE_TYPE', 'int8'),
    download_root='/models',
    local_files_only=os.environ.get('WHISPER_LOCAL_ONLY', 'false').lower() == 'true'
)

def audio_suffix(mime_type: str) -> str:
    return {'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a'}.get(mime_type, '.webm')

def transcribe_audio(audio: bytes, mime_type: str, language=None):
    with tempfile.NamedTemporaryFile(suffix=audio_suffix(mime_type)) as source:
        source.write(audio)
        source.flush()
        segments, info = model.transcribe(source.name, language=language or None, vad_filter=True, beam_size=3)
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return text, info.language, info.duration

def read_audio():
    audio = request.get_data(cache=False)
    if not audio or len(audio) > 10 * 1024 * 1024:
        return None, (jsonify(error='audio must be 1 byte to 10 MiB'), 400)
    return audio, None

@app.post('/transcribe')
def transcribe():
    audio, error = read_audio()
    if error:
        return error
    text, language, duration = transcribe_audio(audio, request.mimetype, request.headers.get('x-ujo-language'))
    return jsonify(text=text, language=language, durationSeconds=duration)

@app.post('/wake')
def wake():
    """Prototype custom wake-phrase detector.

    Satellites submit a short speech segment only after local VAD. This is intentionally
    separate from authorization: matching a phrase wakes Ujo but never unlocks or approves.
    For battery/latency optimized products, replace this with a trained KWS model.
    """
    audio, error = read_audio()
    if error:
        return error
    configured = request.headers.get('x-ujo-wake-phrases') or os.environ.get('UJO_WAKE_PHRASES', 'hey ujo,okay ujo')
    phrases = [re.sub(r'[^a-z0-9 ]+', '', phrase.lower()).strip() for phrase in configured.split(',') if phrase.strip()]
    text, language, duration = transcribe_audio(audio, request.mimetype, request.headers.get('x-ujo-language'))
    normalized = re.sub(r'[^a-z0-9 ]+', '', text.lower()).strip()
    matched = next((phrase for phrase in phrases if phrase and phrase in normalized), None)
    return jsonify(detected=bool(matched), phrase=matched, transcript=text, language=language, durationSeconds=duration, authorization=False)

@app.get('/health')
def health():
    return jsonify(ok=True, model=MODEL_NAME, wakePhrases=os.environ.get('UJO_WAKE_PHRASES', 'hey ujo,okay ujo').split(','))

app.run(host='0.0.0.0', port=10300)
