# puzzleapp/app.py
import os
from flask import Flask, send_from_directory
from puzzleapp.backend.api import api_bp


BASE_DIR = os.path.dirname(os.path.abspath(__file__))     # .../puzzleapp
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
PUBLIC_DIR   = os.path.join(FRONTEND_DIR, "public")
SRC_DIR      = os.path.join(FRONTEND_DIR, "src")


def create_app():
    app = Flask(__name__)

    # API blueprint
    app.register_blueprint(api_bp)

    # ---- FRONTEND: index.html ----
    @app.route("/")
    def index():
        return send_from_directory(PUBLIC_DIR, "index.html")

    # ---- FRONTEND: JS/CSS (src/...) ----
    @app.route("/src/<path:path>")
    def serve_src(path):
        # pl. /src/main.js vagy /src/styles/main.css
        return send_from_directory(SRC_DIR, path)

    # ha kell bármi más a public-ból (képek stb.)
    @app.route("/public/<path:path>")
    def serve_public(path):
        return send_from_directory(PUBLIC_DIR, path)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
