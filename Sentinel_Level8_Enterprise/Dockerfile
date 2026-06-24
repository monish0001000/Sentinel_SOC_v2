FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Install Common Python Libs
COPY requirements.txt /tmp/requirements.txt
# Add Level-8 deps
RUN echo "redis" >> /tmp/requirements.txt
RUN echo "networkx" >> /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Source code is mounted via docker-compose volumes
CMD ["python", "main.py"]
