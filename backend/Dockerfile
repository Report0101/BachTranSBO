FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --uid 10001 --create-home sbo && mkdir /data && chown sbo /data
COPY backend backend
USER sbo
EXPOSE 8080
CMD ["uvicorn", "backend.service:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
