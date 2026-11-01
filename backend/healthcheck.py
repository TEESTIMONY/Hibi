import os
from urllib.request import Request, urlopen

if __name__ == "__main__":
    host = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost").split(",")[0].strip()
    request = Request(f"http://127.0.0.1:{int(os.getenv('PORT', '8000'))}/api/health", headers={"Host": host})
    with urlopen(request, timeout=4) as response:
        if response.status != 200:
            raise SystemExit(1)
