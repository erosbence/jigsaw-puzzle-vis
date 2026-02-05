import os

class Config:
    DEBUG = os.getenv("DEBUG", "1") == "1"
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5000"))
