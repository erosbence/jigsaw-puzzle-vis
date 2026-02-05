from puzzleapp.app import app

application = app  # gunicorn entry: gunicorn wsgi:application