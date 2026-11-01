"""Container entrypoint. Migrations run as a separate, explicit release step."""
import os

if __name__ == "__main__":
    arguments = [
        "gunicorn", "config.wsgi:application", "--bind", f"0.0.0.0:{int(os.getenv('PORT', '8000'))}",
        "--workers", os.getenv("WEB_CONCURRENCY", "2"), "--threads", "2", "--timeout", "180",
        "--access-logfile", "-", "--error-logfile", "-", "--capture-output",
    ]
    os.execvp(arguments[0], arguments)
