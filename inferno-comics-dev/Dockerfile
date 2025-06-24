FROM docker:dind

RUN apk update && apk add --no-cache openssh-client=9.9_p2-r0 openssh-server=9.9_p2-r0 bash

RUN adduser -D -g '' amaterasu
RUN echo "amaterasu:amaterasu" | chpasswd

RUN ssh-keygen -A
# Expose the SSH port
EXPOSE 22

# Start SSH service
CMD ["/usr/sbin/sshd", "-D"]