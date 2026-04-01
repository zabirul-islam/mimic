from flask import Flask, request, Response
import subprocess, tempfile, os

app = Flask(__name__)

VOICES = {
    "alloy":   "com.apple.eloquence.en-US.Rocko",
    "echo":    "com.apple.eloquence.en-US.Reed",
    "fable":   "com.apple.eloquence.en-US.Eddy",
    "onyx":    "com.apple.speech.synthesis.voice.Fred",
    "nova":    "com.apple.voice.compact.en-US.Samantha",
    "shimmer": "com.apple.eloquence.en-US.Shelley",
    "default": "com.apple.eloquence.en-US.Rocko",
}

@app.route('/v1/audio/speech', methods=['POST'])
def tts():
    data = request.get_json()
    text  = data.get('input', 'Hello')
    voice = data.get('voice', 'default')
    speed = data.get('speed', 1.0)

    voice_id = VOICES.get(voice, VOICES['default'])
    rate = int(165 * float(speed))

    aiff = tempfile.NamedTemporaryFile(suffix='.aiff', delete=False)
    aiff.close()
    wav  = tempfile.NamedTemporaryFile(suffix='.wav',  delete=False)
    wav.close()

    try:
        subprocess.run(
            ['say', '-v', voice_id, '-r', str(rate), '-o', aiff.name, text],
            check=True
        )
        subprocess.run(
            ['afconvert', '-f', 'WAVE', '-d', 'LEI16', aiff.name, wav.name],
            check=True
        )
        with open(wav.name, 'rb') as f:
            audio = f.read()
    finally:
        os.unlink(aiff.name)
        try: os.unlink(wav.name)
        except: pass

    return Response(audio, mimetype='audio/wav',
                    headers={'Content-Length': len(audio)})

@app.route('/v1/models', methods=['GET'])
def models():
    return {'object': 'list', 'data': [{'id': 'tts-1', 'object': 'model'}]}

if __name__ == '__main__':
    print("✓ TTS server ready on http://localhost:8081")
    print("  Default voice: Rocko (English US male)")
    app.run(host='127.0.0.1', port=8081)
