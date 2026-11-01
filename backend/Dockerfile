FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Build-time static collection needs no production credentials or database connection.
RUN mkdir -p certs \
    && python -c "from urllib.request import urlretrieve; urlretrieve('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem', 'certs/global-bundle.pem')" \
    && DJANGO_DEBUG=true python manage.py collectstatic --noinput \
    && useradd --create-home --uid 10001 hibi \
    && chown -R hibi:hibi /app
USER hibi
ENV DJANGO_DEBUG=false
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "healthcheck.py"]
CMD ["python", "serve.py"]
