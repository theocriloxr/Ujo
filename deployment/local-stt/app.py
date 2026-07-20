import os
import tempfile
from flask import Flask, jsonify, request
from faster_whisper import WhisperModel

app = Flask(__name__)
model = WhisperModel(
    os.environ.get('WHISPER_MODEL', 'small.en'),
    device=os.environ.get('WHISPER_DEVICE', 'cpu'),
    compute_type=os.environ.get('WHISPER_COMPUTE_TYPE', 'int8'),
    download_root='/models',
    local_files_only=os.environ.get('WHISPER_LOCAL_ONLY', 'false').lower() == 'true'
)

@app.post('/transcribe')
def transcribe():
    audio = request.get_data(cache=False)
    if not audio or len(audio) > 10 * 1024 * 1024:
        return jsonify(error='audio must be 1 byte to 10 MiB'), 400
    suffix = { 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a' }.get(request.mimetype, '.webm')
    with tempfile.NamedTemporaryFile(suffix=suffix) as source:
        source.write(audio); source.flush()
        segments, info = model.transcribe(
            source.name,
            language=request.headers.get('x-ujo-language') or None,
            vad_filter=True,
            beam_size=3
        )
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return jsonify(text=text, language=info.language, durationSeconds=info.duration)

@app.get('/health')
def health():
    return jsonify(ok=True, model=os.environ.get('WHISPER_MODEL', 'small.en'))

app.run(host='0.0.0.0', port=10300)
