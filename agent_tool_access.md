# Terminal 1 — start the FastAPI tools server

uvicorn tools.api:app --reload --port 8000

# Terminal 2 — expose it to Orchestrate cloud (skip if Orchestrate can already reach localhost)

ngrok http 8000

# Copy the https://xxxx.ngrok.app URL
