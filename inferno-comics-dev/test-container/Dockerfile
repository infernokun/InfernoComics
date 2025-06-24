FROM docker:dind

# Install your additional packages
RUN apk add --no-cache openssh-server shadow sudo bash nano

# Set up SSH server
RUN mkdir -p /var/run/sshd
RUN ssh-keygen -A

# Create amaterasu user with a valid shell
RUN addgroup -S amaterasu && \
    adduser -S -G amaterasu -s /bin/sh amaterasu && \
    echo 'amaterasu:amaterasu' | chpasswd && \
    adduser amaterasu docker

# Make sure the home directory exists and is owned by amaterasu
RUN mkdir -p /home/amaterasu && \
    chown -R amaterasu:amaterasu /home/amaterasu

RUN echo "Port 2222" >> /etc/ssh/sshd_config
RUN echo "KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256,diffie-hellman-group14-sha1" >> /etc/ssh/sshd_config

# Create the startup script directly in the Dockerfile
RUN echo '#!/bin/sh' > /usr/local/bin/start-entrypoint.sh && \
    echo 'set -e' >> /usr/local/bin/start-entrypoint.sh && \
    echo 'echo "Starting SSH server..."' >> /usr/local/bin/start-entrypoint.sh && \
    echo '/usr/sbin/sshd' >> /usr/local/bin/start-entrypoint.sh && \
    echo 'echo "Starting Docker daemon..."' >> /usr/local/bin/start-entrypoint.sh && \
    echo 'exec /usr/local/bin/dockerd-entrypoint.sh' >> /usr/local/bin/start-entrypoint.sh && \
    chmod +x /usr/local/bin/start-entrypoint.sh

# Use CMD instead of ENTRYPOINT
CMD ["/usr/local/bin/start-entrypoint.sh"]