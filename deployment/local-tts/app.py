import os
import subprocess
import tempfile
from flask import Flask, Response, jsonify, request

app = Flask(__name__)

@app.post('/synthesize')
def synthesize():
    body = request.get_json(silent=True) or {}
    text = body.get('text', '')
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        return jsonify(error='text must be 1-1000 characters'), 400
    model = os.environ.get('PIPER_MODEL', '')
    if not model or not os.path.isfile(model):
        return jsonify(error='PIPER_MODEL is not mounted'), 503
    with tempfile.NamedTemporaryFile(suffix='.wav') as output:
        completed = subprocess.run(
            ['piper', '--model', model, '--output_file', output.name],
            input=text.strip().encode(), timeout=30, check=False,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
        if completed.returncode != 0:
            return jsonify(error='local synthesis failed'), 502
        output.seek(0)
        return Response(output.read(), mimetype='audio/wav')

@app.get('/health')
def health():
    model = os.environ.get('PIPER_MODEL', '')
    return jsonify(ok=bool(model and os.path.isfile(model)))

app.run(host='0.0.0.0', port=10200)
