from datetime import datetime, timedelta
from random import randint

def get_challenges(docker_room, admin_user):
    questions_flags_hints = [
        # BEGINNER Level (50-100 points)
        {
            "question": "What command is used to run a Docker container interactively with a terminal?",
            "flag": "docker run -it",
            "hints": [
                "You need flags to make it interactive and allocate a pseudo-TTY.",
                "The -i flag keeps STDIN open, -t allocates a pseudo-TTY.",
                "Combine 'docker run' with interactive flags."
            ],
            "difficulty": "BEGINNER",
            "points": 50,
            "tags": ["docker", "containers", "interactive", "terminal"],
            "category": "Docker Basics",
            "solution": "Use 'docker run -it <image>' to run a container interactively with terminal access."
        },
        {
            "question": "What command shows all running Docker containers?",
            "flag": "docker ps",
            "hints": [
                "Think 'process status' but for Docker.",
                "This is one of the most basic Docker commands.",
                "Similar to 'ps' command in Linux but for containers."
            ],
            "difficulty": "BEGINNER",
            "points": 50,
            "tags": ["docker", "containers", "list", "status"],
            "category": "Docker Basics",
            "solution": "'docker ps' lists all currently running containers."
        },
        {
            "question": "What command pulls a Docker image from a registry without running it?",
            "flag": "docker pull",
            "hints": [
                "You want to download an image for later use.",
                "This command only downloads, doesn't run.",
                "Think about 'pulling' something from a remote location."
            ],
            "difficulty": "BEGINNER",
            "points": 75,
            "tags": ["docker", "images", "registry", "download"],
            "category": "Docker Images",
            "solution": "'docker pull <image>' downloads an image from a Docker registry."
        },
        {
            "question": "What flag is used with 'docker run' to run a container in the background (detached mode)?",
            "flag": "-d",
            "hints": [
                "You want the container to run without blocking your terminal.",
                "Think 'detached' mode.",
                "It's a single letter flag."
            ],
            "difficulty": "BEGINNER",
            "points": 75,
            "tags": ["docker", "containers", "detached", "background"],
            "category": "Docker Basics",
            "solution": "The '-d' flag runs containers in detached (background) mode."
        },
        {
            "question": "What command removes a Docker container?",
            "flag": "docker rm",
            "hints": [
                "Think 'remove' but abbreviated.",
                "You need the container ID or name.",
                "Container must be stopped first (unless you force it)."
            ],
            "difficulty": "BEGINNER",
            "points": 100,
            "tags": ["docker", "containers", "remove", "cleanup"],
            "category": "Docker Cleanup",
            "solution": "'docker rm <container>' removes a stopped container."
        },

        # EASY Level (100-200 points)
        {
            "question": "What command builds a Docker image from a Dockerfile in the current directory and tags it as 'myapp:latest'?",
            "flag": "docker build -t myapp:latest .",
            "hints": [
                "You need to build, tag, and specify the build context.",
                "The -t flag is used for tagging.",
                "Don't forget the build context (current directory)."
            ],
            "difficulty": "EASY",
            "points": 150,
            "tags": ["docker", "build", "dockerfile", "tag"],
            "category": "Docker Images",
            "solution": "'docker build -t myapp:latest .' builds and tags an image from current directory."
        },
        {
            "question": "What command shows the logs of a running container named 'webapp'?",
            "flag": "docker logs webapp",
            "hints": [
                "You want to see what the container is outputting.",
                "Use the container name instead of ID.",
                "Logs command shows stdout and stderr."
            ],
            "difficulty": "EASY",
            "points": 125,
            "tags": ["docker", "logs", "debugging", "containers"],
            "category": "Docker Debugging",
            "solution": "'docker logs <container>' shows the container's log output."
        },
        {
            "question": "What command creates a Docker volume named 'data-vol'?",
            "flag": "docker volume create data-vol",
            "hints": [
                "Volumes are used for persistent data storage.",
                "You need to create before you can use it.",
                "Use the volume subcommand."
            ],
            "difficulty": "EASY",
            "points": 175,
            "tags": ["docker", "volumes", "storage", "persistence"],
            "category": "Docker Storage",
            "solution": "'docker volume create <name>' creates a named volume for data persistence."
        },
        {
            "question": "What command executes the 'bash' command inside a running container named 'mycontainer'?",
            "flag": "docker exec -it mycontainer bash",
            "hints": [
                "You want to execute a command in an already running container.",
                "You'll need interactive flags for bash shell.",
                "Use exec, not run, for existing containers."
            ],
            "difficulty": "EASY",
            "points": 200,
            "tags": ["docker", "exec", "bash", "shell"],
            "category": "Docker Debugging",
            "solution": "'docker exec -it <container> bash' opens an interactive bash shell in a running container."
        },
        {
            "question": "What command maps port 8080 on your host to port 80 in the container when running nginx?",
            "flag": "docker run -p 8080:80 nginx",
            "hints": [
                "You need port mapping between host and container.",
                "Format is host-port:container-port.",
                "Use the -p flag for port mapping."
            ],
            "difficulty": "EASY",
            "points": 175,
            "tags": ["docker", "networking", "ports", "nginx"],
            "category": "Docker Networking",
            "solution": "'docker run -p 8080:80 nginx' maps host port 8080 to container port 80."
        },

        # MEDIUM Level (200-400 points)
        {
            "question": "What command runs a MySQL container with environment variable MYSQL_ROOT_PASSWORD set to 'secret123' and maps port 3306?",
            "flag": "docker run -e MYSQL_ROOT_PASSWORD=secret123 -p 3306:3306 mysql",
            "hints": [
                "You need environment variables and port mapping.",
                "Use -e flag for environment variables.",
                "MySQL typically runs on port 3306."
            ],
            "difficulty": "MEDIUM",
            "points": 250,
            "tags": ["docker", "mysql", "environment", "database"],
            "category": "Docker Applications",
            "solution": "Use -e for environment variables and -p for port mapping when running database containers."
        },
        {
            "question": "What Docker Compose command starts all services defined in docker-compose.yml in detached mode?",
            "flag": "docker-compose up -d",
            "hints": [
                "Docker Compose manages multi-container applications.",
                "You want to start services in the background.",
                "The 'up' command starts services."
            ],
            "difficulty": "MEDIUM",
            "points": 300,
            "tags": ["docker-compose", "services", "orchestration"],
            "category": "Docker Compose",
            "solution": "'docker-compose up -d' starts all services defined in the compose file in detached mode."
        },
        {
            "question": "What command creates a custom Docker network named 'mynetwork' with the bridge driver?",
            "flag": "docker network create --driver bridge mynetwork",
            "hints": [
                "Custom networks allow better container communication.",
                "Bridge is the default network driver.",
                "Use the network subcommand."
            ],
            "difficulty": "MEDIUM",
            "points": 275,
            "tags": ["docker", "networking", "bridge", "custom"],
            "category": "Docker Networking",
            "solution": "'docker network create --driver bridge <name>' creates a custom bridge network."
        },
        {
            "question": "What command copies a file named 'config.txt' from your host to '/app/' directory inside a running container 'webapp'?",
            "flag": "docker cp config.txt webapp:/app/",
            "hints": [
                "You need to copy files between host and container.",
                "Use the cp command like in Linux.",
                "Format is source:destination."
            ],
            "difficulty": "MEDIUM",
            "points": 225,
            "tags": ["docker", "copy", "files", "filesystem"],
            "category": "Docker File Operations",
            "solution": "'docker cp <source> <container>:<destination>' copies files between host and container."
        },
        {
            "question": "What command mounts the host directory '/home/user/data' to '/data' in the container when running ubuntu?",
            "flag": "docker run -v /home/user/data:/data ubuntu",
            "hints": [
                "You need volume mounting for shared directories.",
                "Use -v flag for volume mounts.",
                "Format is host-path:container-path."
            ],
            "difficulty": "MEDIUM",
            "points": 350,
            "tags": ["docker", "volumes", "mount", "bind"],
            "category": "Docker Storage",
            "solution": "'docker run -v <host-path>:<container-path> <image>' creates a bind mount."
        },

        # HARD Level (400-600 points)
        {
            "question": "What command builds a multi-stage Docker image, targeting only the 'production' stage, and tags it as 'myapp:prod'?",
            "flag": "docker build --target production -t myapp:prod .",
            "hints": [
                "Multi-stage builds have different stages/targets.",
                "You can target specific stages during build.",
                "Use --target flag to specify the stage."
            ],
            "difficulty": "HARD",
            "points": 450,
            "tags": ["docker", "multi-stage", "build", "production"],
            "category": "Advanced Docker",
            "solution": "'docker build --target <stage> -t <tag> .' builds only the specified stage of a multi-stage Dockerfile."
        },
        {
            "question": "What command runs a container with memory limit of 512MB and CPU limit of 0.5 cores?",
            "flag": "docker run --memory=512m --cpus=0.5",
            "hints": [
                "Resource constraints prevent containers from consuming too much.",
                "Memory is specified with units like 'm' for megabytes.",
                "CPU limits can be fractional."
            ],
            "difficulty": "HARD",
            "points": 400,
            "tags": ["docker", "resources", "memory", "cpu"],
            "category": "Docker Resource Management",
            "solution": "Use --memory and --cpus flags to limit container resource usage."
        },
        {
            "question": "What command creates a Docker secret named 'db-password' from a file called 'password.txt' in Docker Swarm?",
            "flag": "docker secret create db-password password.txt",
            "hints": [
                "Secrets are used for sensitive data in Swarm mode.",
                "You can create secrets from files.",
                "This only works in Swarm mode."
            ],
            "difficulty": "HARD",
            "points": 500,
            "tags": ["docker", "swarm", "secrets", "security"],
            "category": "Docker Swarm",
            "solution": "'docker secret create <name> <file>' creates a secret from a file in Docker Swarm."
        },
        {
            "question": "What command initializes a Docker Swarm cluster and advertises the manager on IP 192.168.1.100?",
            "flag": "docker swarm init --advertise-addr 192.168.1.100",
            "hints": [
                "Swarm mode enables container orchestration.",
                "You need to specify the advertise address for cluster communication.",
                "This creates a Swarm manager node."
            ],
            "difficulty": "HARD",
            "points": 550,
            "tags": ["docker", "swarm", "cluster", "orchestration"],
            "category": "Docker Swarm",
            "solution": "'docker swarm init --advertise-addr <ip>' initializes a Swarm cluster with specified manager address."
        },
        {
            "question": "What command creates a Docker service named 'web' running nginx with 3 replicas and published port 80?",
            "flag": "docker service create --name web --replicas 3 --publish 80:80 nginx",
            "hints": [
                "Services are the unit of deployment in Swarm mode.",
                "Replicas determine how many instances to run.",
                "Use --publish for port mapping in services."
            ],
            "difficulty": "HARD",
            "points": 475,
            "tags": ["docker", "service", "swarm", "replicas"],
            "category": "Docker Swarm",
            "solution": "'docker service create' with --name, --replicas, and --publish flags creates a service with multiple instances."
        },

        # EXPERT Level (600-800 points)
        {
            "question": "What command prunes all unused Docker objects (containers, networks, images, volumes) with a filter to only remove objects older than 24 hours?",
            "flag": "docker system prune -a --filter until=24h",
            "hints": [
                "System prune removes multiple types of unused objects.",
                "The -a flag includes unused images.",
                "Filters can be based on time using 'until'."
            ],
            "difficulty": "EXPERT",
            "points": 650,
            "tags": ["docker", "prune", "cleanup", "filter"],
            "category": "Docker Maintenance",
            "solution": "'docker system prune -a --filter until=<time>' removes all unused objects older than specified time."
        },
        {
            "question": "What command exports a container's filesystem as a tar archive named 'backup.tar'?",
            "flag": "docker export container_name > backup.tar",
            "hints": [
                "Export creates a tar archive of the container's filesystem.",
                "This is different from saving an image.",
                "Use output redirection to save to file."
            ],
            "difficulty": "EXPERT",
            "points": 600,
            "tags": ["docker", "export", "backup", "filesystem"],
            "category": "Docker Backup",
            "solution": "'docker export <container>' creates a tar archive of the container's entire filesystem."
        },
        {
            "question": "What command inspects a Docker image and outputs only the exposed ports in JSON format?",
            "flag": "docker inspect --format='{{.Config.ExposedPorts}}' image_name",
            "hints": [
                "Inspect provides detailed information about Docker objects.",
                "Use --format with Go templates to extract specific data.",
                "ExposedPorts is under the Config section."
            ],
            "difficulty": "EXPERT",
            "points": 700,
            "tags": ["docker", "inspect", "json", "ports"],
            "category": "Docker Inspection",
            "solution": "'docker inspect --format' with Go templates extracts specific information from Docker objects."
        },
        {
            "question": "What command runs a container with a custom security profile that drops all capabilities except NET_ADMIN?",
            "flag": "docker run --cap-drop=ALL --cap-add=NET_ADMIN ubuntu",
            "hints": [
                "Linux capabilities control what privileged operations are allowed.",
                "You can drop all capabilities then add back specific ones.",
                "NET_ADMIN allows network administration tasks."
            ],
            "difficulty": "EXPERT",
            "points": 750,
            "tags": ["docker", "security", "capabilities", "linux"],
            "category": "Docker Security",
            "solution": "Use --cap-drop=ALL --cap-add=<capability> to run containers with minimal privileges."
        },
        {
            "question": "What command creates a Docker buildx builder instance named 'mybuilder' that supports multi-platform builds?",
            "flag": "docker buildx create --name mybuilder --use",
            "hints": [
                "Buildx enables advanced build features like multi-platform.",
                "You need to create and use a builder instance.",
                "The --use flag makes it the active builder."
            ],
            "difficulty": "EXPERT",
            "points": 800,
            "tags": ["docker", "buildx", "multi-platform", "builder"],
            "category": "Advanced Docker",
            "solution": "'docker buildx create --name <name> --use' creates and activates a buildx builder for advanced builds."
        }
    ]

    challenges = []
    now = datetime.now()
    
    for idx, q in enumerate(questions_flags_hints):
        challenge = {
            "question": q["question"],
            "maxAttempts": 3 if q["difficulty"] in ["BEGINNER", "EASY"] else 5,
            "roomId": docker_room["id"],
            "description": f"Challenge {idx+1}: {q['category']} - Test your Docker skills with this {q['difficulty'].lower()}-level challenge.",
            "hints": [
                {
                    "hint": hint,
                    "orderIndex": i + 1,
                    "cost": 5 if q["difficulty"] == "BEGINNER" else 10 if q["difficulty"] == "EASY" else 15 if q["difficulty"] == "MEDIUM" else 20 if q["difficulty"] == "HARD" else 25,
                    "isUnlocked": i == 0,  # First hint is always unlocked
                    "unlockAfterAttempts": i,  # Unlock after i failed attempts
                    "usedAt": None,
                    "pointsDeducted": 0
                }
                for i, hint in enumerate(q["hints"])
            ],
            "flags": [
                {
                    "flag": q["flag"],
                    "surroundWithTag": False,
                    "caseSensitive": False,
                    "weight": 1.0
                }
            ],
            "category": q["category"],
            "difficultyLevel": q["difficulty"],
            "points": q["points"],
            "author": admin_user["username"],
            "tags": q["tags"],
            "visible": True,
            "isActive": True,
            "solveCount": 0,
            "attemptCount": 0,
            "releaseDate": now.strftime("%Y-%m-%d %H:%M:%S"),
            "expirationDate": (now + timedelta(days=60)).strftime("%Y-%m-%d %H:%M:%S"),
            "attachments": [],
            "solutionExplanation": q["solution"],
            "relatedChallengeIds": []
        }
        challenges.append(challenge)

    return challenges