FROM jenkins/jenkins:lts
USER root
RUN apt-get update && apt-get install -y \
    curl ca-certificates gnupg lsb-release git jq \
 && rm -rf /var/lib/apt/lists/*
# Docker CLI (DooD) - Architecture-aware installation
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*
USER jenkins