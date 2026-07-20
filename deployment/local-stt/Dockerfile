FROM python:3.12-slim
RUN pip install --no-cache-dir flask==3.1.1 faster-whisper==1.2.1
COPY app.py /app/app.py
USER 65532:65532
EXPOSE 10300
CMD ["python", "/app/app.py"]
