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

    # 🔒 SECURITY HEADERS for production (PythonAnywhere)
    @app.after_request
    def add_security_headers(response):
        # Content Security Policy - Prevents XSS attacks
        # Using local p5.js (no CDN needed)
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self'; "  # Only allow scripts from same origin
            "style-src 'self' 'unsafe-inline'; "  # unsafe-inline needed for dynamic styles
            "img-src 'self' data:; "  # data: for base64 images from backend
            "font-src 'self'; "
            "connect-src 'self' data:; "  # data: needed for p5.js loadImage() with base64
            "frame-ancestors 'none';"
        )

        # Prevent MIME type sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'

        # Prevent clickjacking
        response.headers['X-Frame-Options'] = 'DENY'

        # Enable browser XSS protection
        response.headers['X-XSS-Protection'] = '1; mode=block'

        # Force HTTPS (PythonAnywhere supports this)
        # Only set if not in development mode
        if not app.debug:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

        return response

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
