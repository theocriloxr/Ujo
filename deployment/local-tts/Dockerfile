FROM python:3.12-slim
RUN pip install --no-cache-dir flask==3.1.1 piper-tts==1.5.0
COPY app.py /app/app.py
USER 65532:65532
EXPOSE 10200
CMD ["python", "/app/app.py"]
